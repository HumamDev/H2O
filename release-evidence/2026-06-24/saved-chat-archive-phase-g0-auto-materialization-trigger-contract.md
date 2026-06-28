# Saved Chat Archive — Phase G.0 Auto-Materialization Trigger Contract

Date: 2026-06-28

Status: **PHASE G.0 CONTRACT — NOT IMPLEMENTED**

Lane: Chat Saving Architecture (Phase G — automatic scanner-to-materializer
trigger policy).

This is a **docs-only contract**. No runtime code, validators, capabilities,
Chrome/Desktop runtime, scanner, materializer, or writer were changed. It decides
**whether and how** Desktop scanner output should trigger materialization now that
F.3 proved the manual Desktop materializer works end to end.

## Baseline

```text
5f267bd  docs(studio): close saved chat archive phase e
14aba6e  docs(studio): close saved chat archive phase f   (package materialization proven)
```

Phase F proved a real `validated → written` materialization (package
`archive/packages/69de12dc-….h2ochat`, contentHash `sha256-b47d2938…`), idempotent
on re-run, via a bounded **manual** Desktop operator action — but the scanner
still only validates/enqueues (`packageWriteDeferred:true`,
`materializeTriggered:false`) and never materializes.

## Investigation summary (current behavior, as built)

- **Scanner** `scanSavedChatArchiveRequestInboxV1` (`…request-inbox.tauri.js`) is
  **enqueue-only** — "writes receipts and never materializes packages." It reads
  inbox `*.request.json` files, validates/enqueues into SQLite, writes the
  immutable scan receipt with `materializeTriggered:false` / `packageWriteDeferred:true`,
  and returns **per-request results** (`status`, `requestId`, `enqueueStatus`).
  Options today: `writeReceipt`, `limit`, `fileName`, `requestId`. It does **not**
  reference the materializer.
- **Materializer** `materializeSavedChatArchiveRequestV1` (`…materializer.tauri.js`)
  is Desktop/Tauri-only, idempotent, and eligibility-gated: `validated → writing →
  written`; `written → already-written` (no writer call); everything else →
  `not-eligible`; absent → `not-found`. It re-resolves against the live store
  before writing and calls `writeSavedChatPackageV1({ snapshotId, overwrite:false })`.
- **Queue states** (`saved_chat_archive_requests.status`): `validated`,
  `writing`, `written`, `failed`, `needs-desktop-snapshot`, `db-unavailable`,
  `rejected`, `duplicate`.
- **Listing** `listSavedChatArchiveRequestsV1({ status:'validated', limit })`
  enumerates validated rows (`ORDER BY updated_at DESC`, `limit` clamped 1–500) —
  the exact enumeration the F.2 operator action already uses for its "Load
  validated requests" selector. A batch trigger can reuse this directly.
- **Writer** `writeSavedChatPackageV1` with `overwrite:false` **throws** if the
  `*.h2ochat` package already exists; the materializer turns that into
  `failed` + `meta_json.materialization.errorCode = package-already-exists`. So a
  batch can never silently clobber an existing package.
- **Archive Health** (`…diagnostics.tauri.js`, `diagnoseSavedChatArchiveV1`) is
  read-only; it can see written packages but triggers nothing.
- **F.1/F.2 trigger validator** (`validate-saved-chat-archive-materializer-trigger-v1.mjs`,
  PASS 24) asserts the scanner does **not** call the materializer and that the
  one trigger is a bounded, Desktop-only operator action — no automatic/watcher
  trigger.
- **F.4/F.4.1 package-written status** is contract-only: Chrome keeps "Archived"
  for `queued-on-desktop`; the `package-written` distinction is defined as an
  additive sidecar but **not implemented**.

**Implication:** a batch trigger is cleanly buildable from existing pieces
(`listSavedChatArchiveRequestsV1` + `materializeSavedChatArchiveRequestV1`) **without
coupling the scanner to the materializer** — which is the boundary the existing
validators lock.

## Recommended Phase G decision

**Adopt option C — an explicit, operator-triggered, bounded "Materialize
validated" batch action — and keep the scanner enqueue-only.** Retain option A
(manual single-request action from F.2) as the always-available baseline. Defer
option B (scanner `materializeValidated:true` flag) unless product explicitly
accepts coupling the scanner to the package writer. **Reject option D (background
watcher/daemon) for now.**

**Why C over B/D:**

- **C preserves the enqueue-only scanner boundary.** The scanner stays "validate +
  enqueue + receipt"; materialization remains a separate, explicit Desktop gesture
  that simply routes a *bounded batch* of `validated` `requestId`s through the same
  materializer F.3 proved. It reuses `listSavedChatArchiveRequestsV1` +
  `materializeSavedChatArchiveRequestV1` — the exact building blocks already
  validated. The F.1/F.2 trigger validator's "scanner does not call the
  materializer" invariant stays intact.
- **B couples scan to package writes.** `materializeValidated:true` would make the
  scanner itself a package writer, flip the locked `materializeTriggered:false`
  invariant, and make a routine scan heavy and side-effectful. Only consider it
  later, with its own contract amendment, if a true one-call scan+write is wanted.
- **D is a daemon.** A background watcher/poller violates the standing
  no-watcher/no-daemon boundary held since Phase F and removes the operator's
  explicit consent before real package writes. Rejected for G.0/G.1.

C is "explicit, operator-triggered, not a daemon" — exactly the user's stated
preference — and is the smallest step from F.2's single-request action (one
`requestId`) to a bounded batch (the `validated` set).

## Contract

### 1. Trigger policy options

| Option | Description | Disposition |
|---|---|---|
| **A. Manual single (F.2)** | Operator materializes one explicit `requestId`. | **Keep** — baseline, always available. |
| **B. Scanner flag `materializeValidated:true`** | Scanner materializes just-validated rows after enqueue. | **Deferred** — couples scanner→writer; needs explicit acceptance + its own amendment. |
| **C. Post-scan operator "Materialize validated" batch** | A separate bounded Desktop action lists `validated` rows and materializes each; scanner unchanged. | **RECOMMENDED** for Phase G. |
| **D. Background watcher/daemon** | Automatic, passive materialization. | **REJECTED** for G.0/G.1 (no daemon/poller/watcher). |

### 2. Recommended decision

Explicit, operator/scanner-triggered materialization **first**, not a background
daemon: ship **C** (bounded operator batch), keep **A**, defer **B**, reject **D**.
Materialization stays a deliberate, Desktop-only, operator-consented gesture.

### 3. Eligibility (routes to the existing materializer; invents no new eligibility)

- **`validated` only** is eligible → `writing → written`.
- **`written`** is idempotent → `already-written` (no writer call, no duplicate).
- **`duplicate` / `rejected` / `needs-desktop-snapshot`** are **not eligible** →
  `not-eligible` (skipped and counted; never force-materialized).
- **`failed` is explicit:** pre-existing `failed` rows are **not** in the
  `validated` batch set and are **not** auto-re-armed to `validated`; a row that
  fails *during* the run is marked `failed` with
  `meta_json.materialization.errorCode`/`errorMessage`, counted in the summary, and
  **not retried** in the same run. Any `failed → validated` retry is a separate,
  explicit operator action (out of scope for G).
- The batch enumerates `validated` rows via `listSavedChatArchiveRequestsV1` and
  routes each `requestId` to `materializeSavedChatArchiveRequestV1`, surfacing
  exactly what the materializer returns.

### 4. Safety

- **`overwrite:false` always** — never passed `true`; existing `*.h2ochat`
  packages are never clobbered (`package-already-exists → failed`, surfaced).
- **Per-run limit** — bounded; recommend a conservative default (e.g. 25 per click)
  with an operator-confirmable larger value, hard-capped (e.g. ≤ 200), reusing the
  listing's 1–500 clamp as the ceiling. **No "materialize all" / unbounded run.**
- **Result summary** — each run reports counts:
  `written` / `already-written` / `failed` / `not-eligible` / `needs-desktop-snapshot`
  (+ `db-unavailable`), with the per-`requestId` outcomes available to the operator.
- **No silent package overwrite**, **no infinite retry loop** (each row is
  attempted at most once per run; `failed` is not re-armed automatically), **and no
  passive Chrome-triggered package write** (Chrome never initiates a batch; the
  trigger is a Desktop operator gesture only).
- **Sequential, bounded execution** — no unbounded concurrency; a re-click is safe
  (already-`written` rows return `already-written`).

### 5. Status propagation

- The DB row transitions to **`written`** and `meta_json.materialization` remains
  the **source of truth** (same as F.2/F.3) — the batch adds no new authority.
- **The F.4 materialization sidecar can remain deferred** — Phase G does not write
  the Chrome-visible sidecar; the batch updates only the DB + package, exactly like
  the single-request action.
- **The Chrome `package-written` badge remains deferred** until auto-materialization
  is routine. Once C makes materialization a normal one-click batch (so most
  `validated` rows actually become `written`), the F.4.2/F.4.3 sidecar + read-back
  gain real day-to-day value and can be revisited (see G.4).

### 6. UX

- **Desktop-only.** The batch action is Tauri-gated, like the F.2 single action.
- **Home: Archive Health / Diagnostics.** Extend the existing F.2 operator action
  card from "materialize one `requestId`" to also offer a bounded **"Materialize
  validated"** batch (showing the eligible `validated` count before the click and a
  result summary after). The read-only diagnostics card stays read-only; the action
  remains a separate, clearly-labelled operator affordance.
- **No global floating button.** No app-wide proof/materialize button.
- **No Chrome row-level package mutation.** Chrome rows never trigger package
  writes; the batch is initiated only from the Desktop Diagnostics surface.

### 7. Boundaries (hard invariants for Phase G)

- **Chrome remains intent / read-back only** — no SQL/CAS/package writes; no
  Chrome-initiated materialization.
- **Desktop owns the scanner, materializer, package writer, DB, and Archive
  Health** — and remains the sole package writer from the resolved Desktop
  `snapshotId`.
- **Scanner stays enqueue-only** under recommendation C (the
  `materializeTriggered:false` invariant holds); only an explicitly-accepted option
  B would change this, with its own amendment.
- **No WebDAV / cloud / sync / native messaging / localhost relay.**
- **No watcher / poller / daemon in G.0/G.1** — the batch runs only on an explicit
  operator click; no `setInterval`/`MutationObserver`/background loop.
- **No `S0F0j` / `S0F1j` edits.**
- **`overwrite:false`** default; no unguarded recursive deletes.

### 8. Proposed implementation phases

| Phase | Deliverable |
|---|---|
| **G.0** | This contract (NOT IMPLEMENTED). |
| **G.1** | Static **validator** for the auto-materialization trigger contract: bounded operator-batch only (no daemon/watcher), `overwrite:false`, per-run limit, full result-count vocabulary, eligibility routes through the materializer (no new eligibility), scanner stays enqueue-only, Chrome unchanged. |
| **G.2** | Desktop **"Materialize validated" batch action** (extends the F.2 operator card): lists `validated` rows (bounded), materializes each via the existing materializer, renders a result summary. Desktop-only; no scanner coupling. |
| **G.3** | **Runtime smoke**: enqueue/scan a set of `validated` requests → operator batch → all reach `written` (or `already-written` on re-run); disk/DB/Health verified; bounded limit + summary proven; no overwrite. |
| **G.4** | **Optional sidecar integration decision** — now that materialization is routine, decide whether to proceed to F.4.2/F.4.3 (Chrome-visible `package-written`) or keep it Desktop-only. |
| **G.5** | Phase G **closure** note. |

## Boundaries held (this contract)

- Docs/evidence only — **no** runtime code, validators, capabilities, Chrome
  runtime/service-worker, scanner, materializer, or writer changed.
- Chrome remains intent / read-back; Desktop remains authoritative.
- No watcher/poller/daemon, no native messaging, no WebDAV/cloud/sync.
- No `S0F0j` / `S0F1j` edits. No sync/appearance/ribbon dirty files touched. No
  unrelated files staged.

## Verdict

**PHASE G.0 CONTRACT — NOT IMPLEMENTED.** Recommended policy: an **explicit,
Desktop-only, bounded operator "Materialize validated" batch** (option C) that
keeps the scanner enqueue-only and reuses the F.2/F.3 building blocks, with
`overwrite:false`, a per-run limit, and a written/already-written/failed result
summary. No background daemon; no Chrome authority change; the F.4 sidecar / Chrome
`package-written` badge stay deferred until materialization is routine.

## Recommended next step after G.0

Proceed to **G.1** — author the static validator that locks this policy (bounded
operator batch only; no daemon/watcher; `overwrite:false`; per-run limit; full
result-count vocabulary; eligibility routed through the materializer; scanner stays
enqueue-only; Chrome unchanged) — before any G.2 batch action is built. Confirm the
per-run default/cap and whether the batch lives as an extension of the existing F.2
operator card (recommended) before G.2.
