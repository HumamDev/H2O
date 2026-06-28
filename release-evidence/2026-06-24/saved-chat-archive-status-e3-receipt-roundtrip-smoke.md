# Saved Chat Archive Status Badge — E.3 Desktop Receipt Round-Trip Smoke

Date: 2026-06-28

Status: E.3 EXECUTED — PASSED (Desktop-receipt read-back round-trip proven with
real on-disk receipts; one terminal state — `archived`/`validated` — deferred for
a documented environmental reason, see "Scope and deferrals").

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/evidence-only smoke note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes.

Baselines:

```text
99edac6  (E.1 closed)
da3d2df  docs(studio): close archive status milestone   (E.2 closed)
```

## What E.3 Sets Out To Prove

The Desktop receipt round-trip for a saved-chat archive request:

1. Chrome holds `requestId`-backed rows whose badge reads `waiting-for-desktop`.
2. The Desktop scanner processes request files from the inbox and writes receipt
   files to the receipts directory (enqueue-only; no materialize).
3. A Chrome badge read-back gesture reads a receipt by `requestId`.
4. The badge updates from `waiting-for-desktop` to the receipt-backed terminal
   state: `archived` / `already-archived` / `needs-desktop-snapshot` / `failed`.

The point of de-risking is the **read-back direction**: does the real, shipped
Chrome badge gesture read a real Desktop-authored receipt off disk and flip the
badge to the correctly mapped state, through both mapping layers, with no
fabrication?

## Method And Environment

- **Chrome side (read-back under test).** The live MV3 extension Studio page was
  driven via the Chrome DevTools Protocol on port **9247** (Google Chrome Dev
  v151). Every probe is a read-only `Runtime.evaluate` against the real shipped
  `H2O.Studio.ingestion.*` API surface — the same code the product runs. No
  runtime files were patched.
- **Desktop side (receipt producer).** The Tauri webview exposes **no
  remote-debugging port** and is not programmatically reachable from this harness.
  The receipts consumed in this smoke are **genuine prior authoritative output**
  of the Desktop scanner already on disk (newest receipt mtime `Jun 27 15:32`,
  predating this session's date `2026-06-28`).
- **Archive request folder** (File System Access handle target / Desktop
  `BaseDirectory::Home` root):
  `/Users/hobayda/H2O Studio Archive Requests`
  - `inbox/`: **72** `*.request.json`
  - `receipts/`: **12** `*.receipt.json`

- **Seeding without writes.** E.2 cleared live delivered metadata, so there were
  no naturally-rendered `waiting-for-desktop` badges to click. Each scenario seeds
  the row's delivery state by passing a `local` override object directly into
  `appendSavedChatArchiveStatusBadgeV1({ ..., local })` — `resolveLocal` returns
  an object override verbatim, so **nothing is written to localStorage**. The row
  identity (`chatId` / `snapshotId`) is a real eligible live library row
  (`d3b2_inbox_chat_1782391840992`). Everything in the pipeline under test — the
  reader, both mapping layers, the gesture handler, and `applyStatusToBadge` — is
  the unmodified shipped code.

## On-Disk Receipt Inventory (Authoritative Desktop Output)

12 receipts, all schema `h2o.savedChatArchiveRequestReceipt.v1`:

```text
  5  duplicate
  1  needs-desktop-snapshot
  6  rejected
  0  validated
```

No `validated` receipt exists on disk. This is the single reason the `archived`
terminal state cannot be demonstrated from existing artifacts (see deferrals).

## Step A — Chrome `requestId`-Backed `waiting-for-desktop`

For each scenario the pre-read badge state was computed by the real model:

```text
computeSavedChatArchiveStatusV1({ row, local:{delivered:true, requestId}, diagnostics })
  => state: "waiting-for-desktop"   (reason: delivered-no-receipt)
```

All three scenarios reported `preReadBadgeState: "waiting-for-desktop"` with a
populated `requestId`, satisfying the `rowsWithRequestId > 0` precondition.

## Step B — Desktop Scanner / Receipts

The Desktop scanner (`scanSavedChatArchiveRequestInboxV1`, enqueue-only:
`packageWriteDeferred: true`, `materializeTriggered: false`, `manualScanOnly`)
was **not re-run during this session** because the Tauri webview has no debug
port. Instead, this smoke consumes the scanner's **genuine prior output** already
present in `receipts/` (12 files, newest `Jun 27 15:32`). The three receipts
exercised below are real files on disk:

| requestId | on-disk `status` | schema |
|---|---|---|
| `a068fbe7-aee5-4edc-a761-4ccc82d4d05b` | `duplicate` | `h2o.savedChatArchiveRequestReceipt.v1` |
| `d3b2_oversized_1782391840992` | `rejected` | `h2o.savedChatArchiveRequestReceipt.v1` |
| `323be131-ae1d-4f53-962e-58bf35755da2` | `needs-desktop-snapshot` | `h2o.savedChatArchiveRequestReceipt.v1` |

## Step C — Chrome Read-Back And Badge Update

Each scenario ran, against the live extension:

```text
read = await readSavedChatArchiveRequestReceiptV1({ requestId })
post = computeSavedChatArchiveStatusV1({ row, local, diagnostics, receipt: read })
```

| Scenario | on-disk status | reader status (layer 1) | pre badge | post badge (layer 2) | proof level |
|---|---|---|---|---|---|
| already-archived | `duplicate` | `already-queued-duplicate` | `waiting-for-desktop` | `already-archived` | reader+model **and** real DOM gesture flip |
| failed | `rejected` | `rejected-by-desktop` | `waiting-for-desktop` | `failed` | reader+model **and** real DOM gesture flip |
| needs-desktop-snapshot | `needs-desktop-snapshot` | `needs-desktop-snapshot` | `waiting-for-desktop` | `needs-desktop-snapshot` | reader+model only¹ |

¹ The `needs-desktop-snapshot` receipt's `requestId` is a standalone request not
paired to the live eligible row, so it was proven through the reader and status
model only — not as a DOM gesture flip. Pairing fidelity for that receipt would
require its own delivered row; the mapping itself is proven.

### Real DOM Gesture Flips

A real `MouseEvent('click')` was dispatched on the rendered, wired badge span
(`role="button"`, carrying `data-h2o-archive-request-id`). The handler read the
attribute, called `readSavedChatArchiveRequestReceiptV1`, recomputed, and
re-applied:

```text
already-archived:
  data-h2o-archive-status  waiting-for-desktop -> already-archived
  badge text               "Waiting for Desktop" -> "Already archived"
  domFlipPass: true

failed:
  data-h2o-archive-status  waiting-for-desktop -> failed
  badge text               "Waiting for Desktop" -> "Archive failed"
  domFlipPass: true
```

### Two-Layer Receipt Status Mapping (Both Layers Exercised)

```text
Layer 1 — Chrome READER mapReceiptStatus (receipt vocab -> read-back status):
  duplicate               -> already-queued-duplicate
  rejected                -> rejected-by-desktop
  needs-desktop-snapshot  -> needs-desktop-snapshot

Layer 2 — STATUS MODEL mapReceiptStatus (read-back status -> badge state):
  already-queued-duplicate -> already-archived
  rejected-by-desktop      -> failed
  needs-desktop-snapshot   -> needs-desktop-snapshot
```

## Read-Only Boundary — Confirmed

Chrome's receipt check created and mutated nothing:

```text
receipts count       12      (unchanged)
newest receipt mtime Jun 27 15:32   (predates session date 2026-06-28)
inbox count          72      (unchanged)
```

Final live-extension residue check (after removing every constructed node):

```json
{
  "deliveredKeyPresent": false,
  "deliveredKeyValue": null,
  "leftoverConstructedArticles": 0,
  "archiveBadgesInDom": 0,
  "bodyDirectArticleChildren": 0
}
```

The single transient `article` that an interim check saw was the **genuine
virtualized library row** for `d3b2_inbox_chat_1782391840992` (it unmounted on a
later list rerender; a parent-chain discriminator probe subsequently returned
`matchCount: 0`). No synthetic node, badge, or localStorage key remains.

## Scope And Deferrals

- **`archived` (`validated`) terminal state — DEFERRED (environmental).** No
  `validated` receipt exists on disk. Producing one requires running
  `scanSavedChatArchiveRequestInboxV1` against a fresh valid request **inside the
  Tauri webview**, which exposes no debug port for programmatic invocation this
  session. The mapping itself is established and validator-covered
  (`validated -> queued-on-desktop -> archived`); only the live-artifact
  demonstration is deferred.
- **Step B fresh scan — NOT RE-RUN this session,** same reason. The receipts
  consumed are the Desktop scanner's genuine prior output, not fabricated.

These are honest limits of the reachable surface, not failures of the round-trip
wiring. Three of the four receipt-backed terminal states are proven end-to-end
with real Desktop artifacts, two of them as real DOM gesture flips.

## Validation

Runtime code was not changed, so the static/runtime validators must still pass:

```text
validate-saved-chat-archive-status-badge-v1.mjs              PASS 30 checks
validate-saved-chat-archive-status-v1.mjs                    PASS 19 checks
validate-saved-chat-archive-request-delivery-v1.mjs          all 22 checks passed
validate-saved-chat-archive-request-delivery-runtime-v1.mjs  PASS 24 checks
git diff --check                                             clean
git diff --cached --check                                    clean
```

## Non-Goals Respected

- No runtime code modified (Chrome or Desktop).
- No polling, no watcher, no `MutationObserver` added.
- No passive Chrome read-back; read-back is gesture-driven only.
- No Chrome materialize / enqueue / package / CAS / SQLite writes.
- Desktop remained authoritative; Chrome remained read-only (folder unchanged).
- No `S0F0j` / `S0F1j` edits; no app-wide floating proof button.

## Verdict

**E.3 EXECUTED — PASSED.** The Desktop-receipt read-back round-trip is proven
against the live extension with real on-disk Desktop receipts and real DOM badge
gestures: `waiting-for-desktop` flips to `already-archived` (`duplicate`),
`failed` (`rejected`), and `needs-desktop-snapshot`, through both mapping layers.
The `archived`/`validated` terminal state is the single deferred branch, blocked
only by the Tauri webview having no debug port to produce a fresh `validated`
receipt this session.

## Recommended Next Step

In Tauri DevTools, run
`H2O.Studio.ingestion.scanSavedChatArchiveRequestInboxV1({ manualScanOnly: true })`
against a freshly delivered valid request to produce a `validated` receipt, then
repeat the Chrome read-back gesture to demonstrate the `archived` terminal state
and close the one deferred branch — completing the four-state matrix.
