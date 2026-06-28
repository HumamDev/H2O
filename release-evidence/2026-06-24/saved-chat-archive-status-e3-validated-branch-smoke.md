# Saved Chat Archive Status Badge — E.3.1 Validated Receipt Branch Smoke

Date: 2026-06-28

Status: E.3.1 EXECUTED — PASSED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/evidence-only smoke note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes.

Baseline commits:

```text
99edac6  (E.1 closed)
da3d2df  docs(studio): close archive status milestone   (E.2 closed)
55e3316  docs(studio): record archive receipt roundtrip smoke   (E.3)
```

## What E.3.1 Sets Out To Prove

E.3 (see `saved-chat-archive-status-e3-receipt-roundtrip-smoke.md`, committed
`55e3316`) proved three of the four receipt-backed badge states end-to-end —
`already-archived` (`duplicate`), `failed` (`rejected`), and
`needs-desktop-snapshot` — with real DOM gesture flips. It explicitly deferred
the fourth (`archived` / `validated`) because no `validated` receipt existed on
disk at that time.

E.3.1 closes that deferred branch by:

1. Delivering a fresh archive request for an unclaimed Desktop snapshot via the
   real Chrome delivery path.
2. Running the Desktop scanner exactly once (authoritative, Tauri-only), with
   `limit: 200` so all inbox files including the new one are processed.
3. Confirming a `validated` receipt is written to disk.
4. Reading that receipt back through the Chrome badge gesture and verifying the
   DOM flips from `Waiting for Desktop` → `Archived`.

## Pre-Scan Baseline (Chrome)

Before the scanner ran, the Chrome read-back of the target `requestId` confirmed
no receipt existed yet:

```json
{
  "ok": false,
  "status": "delivered-awaiting-desktop",
  "receiptPresent": false,
  "folderConnected": true
}
```

This proves the post-scan `archived` flip is caused by the scanner run, not a
pre-existing artifact.

## Step A — Fresh Archive Request Delivery

A fresh archive request for chat `69f0c5f3-30c4-83eb-9240-26331d09532b`
("☎️ Investment in AI Tools") was delivered via the real Chrome delivery path
(`deliverSavedChatArchiveRequestV1`). The snapshot
`snap_1778516336177_wy9txv06` was unclaimed (not present in
`saved_chat_archive_requests` by dedupeKey) and confirmed present in the Desktop
`snapshots` store. `requireExistingDesktopSnapshot: true` was set.

Both the delivered `requestId` and its `dedupeKey` were confirmed absent from
the Desktop DB before the scan.

**Delivery result:**

```json
{
  "status": "delivered",
  "dedupeKey": "sha256-91405cee43c68c5543493efa43da5adda5b84499737f2ea38756b80b2e20d4f7",
  "atomicMethod": "move",
  "folderConnected": true
}
```

Pre-scan Chrome badge state for the delivered request:
`state: "waiting-for-desktop"`, `reason: "delivered-no-receipt"`.

## Step B — Desktop Scanner Run

The Desktop scanner was run once in Tauri DevTools:

```js
await H2O.Studio.ingestion.scanSavedChatArchiveRequestInboxV1({
  manualScanOnly: true,
  limit: 200
})
```

`limit: 200` was required because the scanner sorts inbox filenames
lexicographically then takes `names.slice(0, limit)` (default 50); with 75
request files in the inbox the target file sorted to position 73 and would have
been silently skipped at the default limit. `MAX_SCAN_LIMIT = 200` (the hard
cap) reaches all 75 files in a single scan.

**Scanner result:**

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

The `completed-with-blockers` status and the 6 unprocessed items (79 scanned −
73 processed) are pre-existing fixture files: malformed JSON, schema mismatches,
and oversized test artifacts. They are not blockers for the `validated` branch
being proven.

`packageWriteDeferred: true` and `materializeTriggered: false` confirm the
scanner ran in enqueue-only mode — no materialize, no package write, no CAS, no
chat content writes.

## Step C — Validated Receipt On Disk

The scanner wrote a `validated` receipt for requestId
`d8edaea2-8a7d-469c-af32-eeaecfc974d8` (the first-processed unclaimed request
for the target dedupeKey; the subsequently-processed request with the same
dedupeKey received a `duplicate` receipt — correct dedup behavior).

**Receipt file verified from disk:**

```
path:     $HOME/H2O Studio Archive Requests/receipts/
          d8edaea2-8a7d-469c-af32-eeaecfc974d8.receipt.json
size:     659 bytes
mtime:    2026-06-28 (session date)
```

**Receipt content (full):**

```json
{
  "schema": "h2o.savedChatArchiveRequestReceipt.v1",
  "requestId": "d8edaea2-8a7d-469c-af32-eeaecfc974d8",
  "dedupeKey": "sha256-91405cee43c68c5543493efa43da5adda5b84499737f2ea38756b80b2e20d4f7",
  "receivedAt": "2026-06-28T11:26:33.669Z",
  "processedAt": "2026-06-28T11:26:33.690Z",
  "sourceFile": "d8edaea2-8a7d-469c-af32-eeaecfc974d8.request.json",
  "requestFileSha256": "sha256-579c8749180494bbc006c39f74b2ca4d9d075b81c953e3298d7442ee57c39a6f",
  "status": "validated",
  "enqueueStatus": "validated",
  "persisted": true,
  "duplicateOf": null,
  "packageWriteDeferred": true,
  "materializeTriggered": false,
  "blockers": [],
  "warnings": []
}
```

**Desktop DB row for the validated receipt:**

```
request_id:  d8edaea2-8a7d-469c-af32-eeaecfc974d8
status:      validated
dedupe_key:  sha256-91405cee43c68c5543493efa43da5adda5b84499737f2ea38756b80b2e20d4f7
snapshot_id: snap_1778516336177_wy9txv06
```

DB validated count: 47 (pre-scan) → 58 (post-scan, +11 validated rows).

## Step D — Chrome Read-Back And Badge Flip

Against the live MV3 extension Studio page (Chrome Dev v151, port 9247), via
`Runtime.evaluate` with `awaitPromise: true, userGesture: true`:

```
requestId:  d8edaea2-8a7d-469c-af32-eeaecfc974d8
chat:       69f0c5f3-30c4-83eb-9240-26331d09532b
title:      ☎️ Investment in AI Tools
snapshot:   snap_1778516336177_wy9txv06
```

**Reader result (layer 1):**

```json
{
  "ok": true,
  "receiptOk": true,
  "receiptStatus": "queued-on-desktop",
  "desktopReceiptStatus": "validated",
  "rowFound": true
}
```

`validated` (Desktop) → `queued-on-desktop` (reader, `mapReceiptStatus` layer 1)

**Status model (layer 2):**

```json
{
  "computedStateBeforeClick": "archived"
}
```

`queued-on-desktop` (reader) → `archived` (status model, `mapReceiptStatus` layer 2)

**DOM badge gesture flip:**

A `MouseEvent('click')` was dispatched on the wired badge span
(`role="button"`, `data-h2o-archive-request-id` carrying the real requestId).
The click handler invoked `readSavedChatArchiveRequestReceiptV1`, recomputed via
`computeSavedChatArchiveStatusV1`, and re-applied via `applyStatusToBadge`:

```text
beforeBadge:
  data-h2o-archive-status  "waiting-for-desktop"
  textContent              "Waiting for Desktop"
  interactive              true (role=button, tabindex=0, clickHandlerBound)

afterBadge:
  data-h2o-archive-status  "archived"
  textContent              "Archived"
  interactive              true
```

`domFlipPass: true`

## Two-Layer Receipt Status Mapping — Complete Four-State Matrix

```text
Layer 1 — Chrome READER mapReceiptStatus (receipt vocab → read-back status):
  validated               → queued-on-desktop          [E.3.1 — this smoke]
  duplicate               → already-queued-duplicate   [E.3]
  rejected                → rejected-by-desktop         [E.3]
  needs-desktop-snapshot  → needs-desktop-snapshot      [E.3]

Layer 2 — STATUS MODEL mapReceiptStatus (read-back status → badge state):
  queued-on-desktop        → archived                  [E.3.1 — this smoke]
  already-queued-duplicate → already-archived          [E.3]
  rejected-by-desktop      → failed                    [E.3]
  needs-desktop-snapshot   → needs-desktop-snapshot    [E.3]
```

All four receipt-backed badge states are now proven end-to-end with real Desktop
artifacts and real DOM badge gestures.

## Boundary Proof

- No fake receipts. The validated receipt was written by the live Desktop
  scanner against a real, well-formed request file and a real snapshot row.
- No passive receipt read-back. The read-back happened through the explicit
  badge click gesture (`appendSavedChatArchiveStatusBadgeV1` → click handler →
  `readSavedChatArchiveRequestReceiptV1`).
- Chrome did not run the Desktop scanner.
- Chrome did not enqueue, materialize, write packages, write to CAS, or write
  to SQLite.
- Desktop scanner remained authoritative: it produced the receipt; Chrome read
  it.
- No polling, no watcher, no `MutationObserver`, no background daemon.
- `packageWriteDeferred: true`, `materializeTriggered: false` on every receipt
  written this session.
- No `S0F0j` / `S0F1j` edits. No app-wide floating proof button.

## Validation

Runtime code was not changed during this session.

```text
validate-saved-chat-archive-status-badge-v1.mjs              PASS 30 checks
validate-saved-chat-archive-status-v1.mjs                    PASS 19 checks
validate-saved-chat-archive-request-delivery-v1.mjs          all 22 checks passed
validate-saved-chat-archive-request-delivery-runtime-v1.mjs  PASS 24 checks
git diff --check                                             clean (exit 0)
git diff --cached --check                                    clean (exit 0)
```

## Verdict

**E.3.1 EXECUTED — PASSED.** The previously deferred `archived` / `validated`
terminal state is now proven end-to-end:

- The Desktop scanner produced a real `validated` receipt for an unclaimed
  snapshot-backed request.
- Chrome read that receipt through the badge gesture path: `validated` (Desktop)
  → `queued-on-desktop` (layer 1) → `archived` (layer 2) → `"Archived"` in the
  DOM.
- The real `MouseEvent('click')` on the wired badge span confirmed the full
  round-trip with `domFlipPass: true`.

Combined with E.3, all four receipt-backed badge states are now demonstrated
with real Desktop receipts and real DOM badge gestures.

## Recommended Next Step

Phase E (product integration) is now fully smoke-tested across all four
receipt-backed terminal states. The recommended next step is to formalize the
E.3.1 closeout, then advance to the first user-facing integration milestone
(packaging trigger, or the Phase E closure note that wraps E.1–E.3.1 into a
single deliverable sign-off).
