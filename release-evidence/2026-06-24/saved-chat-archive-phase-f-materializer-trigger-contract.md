# Saved Chat Archive — Phase F.0 Materializer Trigger Contract

Date: 2026-06-28

Status: PHASE F.0 CONTRACT — NOT IMPLEMENTED

Lane: Chat Saving Architecture (Phase F — materialization trigger).

This is a docs/evidence-only contract note. It adds no runtime code, no
validators, and no Chrome/Desktop/capability changes. It defines the contract
that F.1–F.5 will implement and validate.

## Baseline

```text
5f267bd  docs(studio): close saved chat archive phase e   (Phase E closed)
```

Phase E proved the full delivery → scan → receipt → read-back → badge loop with
all four terminal receipt paths (`validated`/`duplicate`/`rejected`/
`needs-desktop-snapshot`). The Desktop scanner runs **enqueue-only**:
`packageWriteDeferred: true`, `materializeTriggered: false`. A `validated`
request is persisted in `saved_chat_archive_requests` but **no package is written
to the Desktop archive store**.

## Core Problem

Phase E stops at `validated`. The badge shows "Archived", but this is a
**semantic overstatement**: today `archived` is derived purely from a `validated`
receipt (`validated` → `queued-on-desktop` → `archived`), which actually means
"the request validated and is enqueued on Desktop" — *not* "a package exists on
disk". Nothing has been materialized into
`$APPLOCALDATA/archive/packages/*.h2ochat`.

Phase F defines how a `validated`/enqueued archive request becomes a
**materialized saved-chat package** in the Desktop archive store, and how (and
whether) that materialized state becomes visible to Chrome.

## Investigation Summary (Pre-Contract Grounding)

This contract is grounded in the existing runtime, not invented. Key findings:

### The materializer already exists (D.2C) — Phase F is the *trigger*, not the writer

`H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1({ requestId, overwrite=false })`
lives at
`src-surfaces-base/studio/ingestion/saved-chat-archive-materializer.tauri.js`
(252 lines, version `0.1.0-phase-d-2c`). It is **Desktop-only** (returns early
unless Tauri is detected) and already implements:

- Load queue row by `requestId` from `saved_chat_archive_requests`.
- **Accept ONLY `status = validated`.** `written` → idempotent `already-written`
  no-op (returns persisted package, no writer call). Anything else →
  `not-eligible`. Absent → `not-found`.
- **Re-resolve** the persisted `normalized_request_json` against live Desktop
  store (`resolveSavedChatArchiveRequestV1`) immediately before writing; bail
  (no write) if it no longer validates.
- State machine: `validated → writing → written` (success) or
  `writing → failed` (writer threw) or `→ needs-desktop-snapshot` (re-resolution
  no longer validates / no snapshotId) or `→ db-unavailable` (deps/queue/read
  failure).
- Calls the existing Desktop writer
  `writeSavedChatPackageV1({ snapshotId, overwrite:false })`, passing **only the
  resolved Desktop snapshotId** — never Chrome/request content.
- Only DB mutation: the `saved_chat_archive_requests` row
  (`status` / `updated_at` / `meta_json.materialization`, and `snapshot_id` only
  if re-resolution corrected it). Package files are written solely by the writer.

Materializer result shape:

```json
{
  "ok": false,
  "status": "<not-found|db-unavailable|already-written|not-eligible|needs-desktop-snapshot|failed|written>",
  "requestId": "...",
  "previousStatus": "...",
  "packageWriteDeferred": false,
  "chromeRuntime": false,
  "syncTransport": false,
  "package": null,
  "error": null
}
```

**No caller invokes the materializer today** (a repo-wide search for
`materializeSavedChatArchiveRequestV1` outside its own module returns nothing).
This is exactly the gap Phase F fills: a *trigger*.

### Package writer (D.4) is safe and deterministic

`writeSavedChatPackageV1`
(`saved-chat-package-v1.tauri.js`): deterministic `contentHash` (re-projecting
the same store snapshot produces identical bytes), `overwrite:false` by default,
and `assertOverwritableSavedChatPackage` refuses any recursive delete outside
`archive/packages` or of a non-`*.h2ochat` path. Writes under
`$APPLOCALDATA/archive/packages`.

### Archive Health diagnostics (C5) is read-only

`saved-chat-archive-diagnostics.tauri.js`: read-only inventory + hash/asset
validation of packages under `archive/packages`. Its own boundary explicitly
states it "does not touch DB/store rows, mutate live CAS, Sync, Chrome,
import/recovery, user export locations, package materialization, or UI." So the
Health surface can *see* a materialized package but cannot *trigger*
materialization. A Phase F operator action must be a **separate** trigger wired
into the Health/Diagnostics card, leaving the diagnostics module read-only.

### Chrome has no `written` / `package-written` concept

The Chrome reader (`saved-chat-archive-request-delivery.mv3.js`) and status model
(`saved-chat-archive-status.studio.js`) map only receipt statuses
(`validated`/`duplicate`/`rejected`/`needs-desktop-snapshot`). The materializer
writes **no second receipt** — it only updates the DB row + `meta_json`. So today
Chrome cannot distinguish "validated/queued-on-desktop" from "package-written";
both render as `archived`. Closing that gap (if desired) is a deliberate,
Chrome-touching step deferred to F.4.

## Contract

### 1. Trigger source

- **F.0/F.1/F.2: manual operator action only.** A human/operator explicitly
  invokes materialization for a known `requestId` (or a small explicit
  selection). No automatic watcher.
- **Later (optional, F.4+): a scanner-result action** may *offer* materialization
  of the just-validated requests as an explicit follow-up step — still
  operator-confirmed, never silent.
- **No background daemon, no watcher, no polling, no `MutationObserver` in
  F.0/F.1.** The scanner stays enqueue-only (`materializeTriggered: false`)
  unless and until an explicit, contracted trigger is added.

### 2. Eligible states (per the existing materializer contract)

| Request `status` | Trigger outcome | Notes |
|---|---|---|
| `validated` (enqueued) | **Eligible** → `writing` → `written` | The primary, intended path. |
| `written` (already-written) | Idempotent no-op → `already-written`, `ok:true` | Returns persisted package; no writer call. |
| `failed` | **Not eligible** → `not-eligible` | F.1 must decide whether a *retry* path re-arms `failed`→`validated`; default: no auto-retry, surface the failure. |
| `needs-desktop-snapshot` | Not eligible → `not-eligible` | Resolved only by a fresh snapshot + re-validation, not by the materializer. |
| `duplicate` | Not eligible → `not-eligible` | The canonical request (the one it dups) is the materialization target. |

The trigger must **not** invent new eligibility; it routes a `requestId` to the
existing materializer and surfaces whatever the materializer returns.

### 3. Materializer behavior (already enforced; the trigger must preserve it)

- **Desktop-only.** The package writer runs only from Desktop. The trigger is a
  Desktop action.
- **Idempotent.** Re-invoking on a `written` row returns `already-written` with
  the persisted package; no second write.
- **`overwrite:false` by default.** The trigger must not pass `overwrite:true`
  except via an explicit, separately-contracted operator override (out of scope
  for F.1/F.2).
- **Already-written stays safe.** No clobbering of an existing `*.h2ochat`.
- **Failed writes produce clear status.** `failed` with `meta_json.materialization.errorCode`
  (`package-already-exists` | `package-writer-threw`) / `errorMessage`. The
  trigger surfaces these to the operator.

### 4. Receipt / status update

This is the central design decision Phase F must resolve. Options:

- **(a) DB row only (status quo of the materializer).** Materialization updates
  the `saved_chat_archive_requests` row to `written` + `meta_json.materialization`.
  Chrome remains unaware (still reads the original `validated` receipt). Simplest;
  no Chrome change.
- **(b) Second receipt.** The trigger (or a thin Desktop helper) writes a second
  receipt (e.g., `status: written` / `package-written`) into the receipts folder
  so Chrome's existing read-back can observe it. Requires a new receipt status in
  the reader vocabulary (F.4).
- **(c) Both.** DB row is authoritative; a written-receipt is the Chrome-visible
  projection.

**F.0 decision:** default to **(a) for F.1–F.3** (DB row authoritative, no Chrome
change), and treat **(b)/(c) as F.4**, to be taken only if product wants Chrome to
distinguish `queued-on-desktop` vs `package-written`. When/if F.4 proceeds, the
intended mapping is:

```text
validated receipt  → queued-on-desktop → "archived"          (queued, pre-package)
written  receipt   → package-written   → "archived" (stronger / distinct label)
```

**Do not change Chrome behavior in F.1–F.3.** Any Chrome reader/status/badge
change is gated behind F.4 and its own contract amendment.

### 5. UI / UX

- **First implementation is an operator/diagnostic action**, not automatic.
- **No global floating buttons.** No app-wide proof button.
- **Preferred location: the Archive Health / Diagnostics card** (Desktop), as an
  explicit "Materialize this request" / "Write package" affordance next to the
  existing read-only health inventory. The diagnostics module stays read-only;
  the action is a separate wiring.
- **No row-level package mutation from Chrome.** Chrome rows never trigger
  package writes.

### 6. Boundaries (hard invariants for all of Phase F)

- Chrome remains intent / read-back only.
- Desktop remains authoritative for all package writes.
- No Chrome CAS / store / SQLite / package writes.
- No native messaging.
- No WebDAV / cloud / sync.
- No polling / watcher / background daemon.
- No `S0F0j` / `S0F1j` edits.
- `overwrite:false` remains the default; no unguarded recursive deletes.

### 7. Implementation phases

| Phase | Deliverable |
|---|---|
| **F.0** | This contract (NOT IMPLEMENTED). |
| **F.1** | Materializer trigger contract + static validator (documents the trigger surface, eligible states, result mapping; asserts boundaries). |
| **F.2** | Desktop diagnostic/operator action that invokes `materializeSavedChatArchiveRequestV1` for a chosen `requestId`, surfaced in the Archive Health / Diagnostics card. |
| **F.3** | Runtime smoke: a `validated` request → operator action → `written`; package validates under Archive Health; re-run proves `already-written` idempotency. |
| **F.4** | *(Conditional)* Chrome badge / read-back interpretation: distinguish `queued-on-desktop` vs `package-written`, only if product requires it. Own contract amendment. |
| **F.5** | Phase F closure note. |

### 8. Acceptance criteria

- A `validated` request can be driven to `written` via the operator trigger.
- The materializer is idempotent: re-invoking a `written` request returns
  `already-written` with the persisted package and writes nothing new.
- The written package passes Archive Health hash + asset validation.
- Archive Health inventory sees the new `*.h2ochat` package.
- **No duplicate package writes** (one `*.h2ochat` per snapshot; `overwrite:false`
  honored).
- **No Chrome authority drift:** Chrome performs no package/CAS/SQLite writes;
  the badge does not change in F.1–F.3.
- `failed` materialization surfaces a clear `errorCode`/`errorMessage` via
  `meta_json.materialization`.

## Validation

No runtime code was changed; this is a docs-only contract.

```text
git diff --check          clean (exit 0)
git diff --cached --check  clean (exit 0)
```

No docs lint/check script is registered in this repo; the git whitespace checks
above are the applicable static gate for a docs-only commit.

## Recommended Next Step

Proceed to **F.1**: write the materializer-trigger contract + a static validator
that pins the trigger surface (`materializeSavedChatArchiveRequestV1` eligibility
table, result-status vocabulary, and the Desktop-only / no-Chrome-write
boundaries). Because the materializer itself already exists and is proven in
prior phases, F.1 is primarily a contract/validator slice — no new writer code —
followed by F.2's thin Desktop operator action.
