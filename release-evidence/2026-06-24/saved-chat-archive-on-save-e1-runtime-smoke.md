# Saved Chat Archive Delivery Listener — E.1.3 Runtime Smoke

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/evidence-only note recording a real Chrome Studio runtime pass. It adds no
runtime code, no validators, and no Chrome/Desktop/capability changes.

## Context

The E.1.3 smoke was executed in real Chrome Studio after rebuilding/reloading the
extension.

Relevant commits:

```text
6c5e20c feat(studio): add archive delivery listener for saved rows        (E.1.1)
087282c fix(studio): allow linked saved rows in archive delivery listener  (E.1.1 saved-wins fix)
c5df016 docs(studio): record archive delivery listener evidence           (E.1.2 static)
```

## Preflight

- `archive.deliverOnSaveToFolder` flag: `true`
- `diagnoseSavedChatArchiveOnSaveToFolderV1`: available
- `maybeDeliverSavedChatArchiveOnSaveToFolderV1`: available
- `deliverSavedChatArchiveRequestV1`: available
- `listenersInstalled`: `true`
- `deliveryApiAvailable`: `true`
- `libraryIndexAvailable`: `true`
- `chromeStorageAvailable`: `true`
- delivery folder connected: `H2O Studio Archive Requests`
- permission: granted
- File System Access available: `true`
- saved snapshot-backed rows present: `28`

## Pre-Fix Runtime Finding (before `087282c`)

The runtime probe showed:

- `savedSnapshotBacked`: 28
- `deliveredKeysCount`: 25
- `undeliveredSavedSnapshotBacked`: 3
- the 3 undelivered rows were all:
  - `isSaved: true`
  - `isLinked: true`
  - `isImported: false`
  - `displayView: "saved"`
  - `badgeKind: "Saved"`
  - `snapshotId` present
  - archived / deleted: false

Interpretation: the original E.1.1 candidate predicate excluded `isLinked: true`
too broadly and treated saved + linked rows as link-only, so 3 genuinely-saved
snapshot-backed rows were never delivered.

## Post-Fix Runtime Result (after `087282c`)

After the saved-wins fix, the extension was rebuilt/reloaded and the listener
smoke was rerun:

- `before.lastReason`: `cross-surface-sync`
- `before.lastDelivered`: 0
- `after.lastReason`: `library-index:updated`
- `after.lastDelivered`: 0
- `deliveredKeysCount`: 28
- `savedSnapshotBacked`: 28
- `undeliveredSavedSnapshotBacked`: 0
- `linkedSavedRows`: 3
- `linkedSavedUndelivered`: `[]`

Interpretation:

- All saved snapshot-backed rows are now delivered / deduped.
- Linked saved rows are no longer excluded (the 3 previously-undelivered linked
  saved rows are now in the delivered set; `linkedSavedUndelivered` is empty).
- A repeated manual index update did not re-deliver already-deduped rows.
- `after.lastDelivered: 0` is expected because all eligible rows were already
  deduped by the time of the repeated dispatch.
- Persistent dedupe by `chatId|snapshotId` held across the reload.

Note on staggered delivery: the listener applies a per-event cap (5 deliveries
per index update), so a backlog of many already-saved rows drains a few per
index event rather than all at once. That is expected behavior; by the time of
this smoke the backlog had drained to `deliveredKeysCount: 28` /
`undeliveredSavedSnapshotBacked: 0`.

## Boundary Proof

- flag-gated behavior remained ON only during this runtime smoke.
- the implementation default remains OFF.
- no polling.
- no watcher.
- no `setInterval`.
- no `MutationObserver` for delivery.
- no monolith edits.
- no `S0F0j` / `S0F1j` edits.
- no Add-to-Library-only delivery.
- no transcript / messages / html / assets / `contentHash` / package content used.
- delivery remained through `deliverSavedChatArchiveRequestV1`.
- no Chrome enqueue / materialize / package / CAS / SQLite writes.
- no Desktop runtime changes.
- no sync/WebDAV/cloud.
- no native messaging.
- no localhost relay.
- no app-wide floating buttons.

## Proven Corrected E.1 Path

```text
library-index update / cross-surface sync
  -> read H2O.LibraryIndex.getAll()
  -> select saved snapshot-backed rows (saved wins over isLinked)
  -> skip true link-only / missing-snapshot rows
  -> persistent dedupe by chatId|snapshotId
  -> deliver one request per eligible row (per-event cap 5)
```

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

E.1.3 runtime smoke: EXECUTED - PASSED. The corrected archive-on-save listener
delivers one metadata-only request per eligible saved snapshot-backed row
(including saved + linked rows), excludes true link-only and missing-snapshot
rows, and holds persistent `chatId|snapshotId` dedupe across reloads — flag-gated
(default OFF), Chrome intent-only, Desktop authoritative, with no monolith edits.
E.1.4 closure remains the only open E.1 subphase.
