# Saved Chat Archive — Phase F.4 Package-Written Status Contract

Date: 2026-06-28

Status: **F.4 CONTRACT — NOT IMPLEMENTED**

Lane: Chat Saving Architecture (Phase F — Chrome receipt/status semantics after
Desktop package materialization).

This is a **docs-only contract amendment**. No runtime code, validators,
capabilities, Chrome/Desktop runtime, scanner, materializer, or writer were
changed. It decides how (and whether) the new Desktop "package written" reality
proven in F.3 becomes visible to Chrome, and defines the vocabulary, receipt
strategy, authority boundaries, UI behavior, migration, and follow-on phases.

## Baseline

```text
046089a  docs(studio): define archive materializer trigger contract        (F.0)
b8660f2  test(studio): validate archive materializer trigger boundary       (F.1)
a2a3cb7  feat(studio): add desktop archive materializer action              (F.2)
464d512  fix(studio): allow desktop dev archive materializer capabilities   (F.3)
```

F.3 proved the Desktop operator action drives `validated → written` (requestId
`f7cd514a-…`, package `archive/packages/69de12dc-….h2ochat`, contentHash
`sha256-b47d2938…`), idempotent on re-run (`already-written`), with DB / disk /
manifest / diagnostics proof. So a real, distinct **package-written** Desktop
state now exists — which Chrome currently cannot see.

## Investigation summary (current model, as built)

**Two distinct Desktop realities now exist for one request:**
1. **Accepted / queued** — the scanner validated the request and enqueued it
   (`saved_chat_archive_requests.status = validated`); the chat content is
   durably captured as a **snapshot in the Desktop SQLite store** (the source of
   truth).
2. **Package written** — the materializer wrote the portable `.h2ochat` package
   and flipped the DB row to `written` with `meta_json.materialization`
   (packagePath / contentHash / snapshotId / writtenAt).

**The receipt/status pipeline (Chrome ↔ Desktop is files-only):**

```text
Chrome delivery  →  inbox/<requestId>.request.json        (Chrome writes request file)
Desktop scanner  →  reads inbox, enqueues into SQLite,
                    writes receipts/<requestId>.receipt.json   (status: validated|duplicate|
                    rejected|needs-desktop-snapshot|db-unavailable;  materializeTriggered:false,
                    packageWriteDeferred:true)               ← "writes receipts, never materializes"
Chrome read-back →  reads receipts/<requestId>.receipt.json via the granted folder handle only
                    (NO SQLite, NO native messaging, NO package/CAS read, NO materializer call)
```

- **Chrome reader** `readSavedChatArchiveRequestReceiptV1`
  (`saved-chat-archive-request-delivery.mv3.js`): reads exactly one file,
  `receipts/<requestId>.receipt.json` (schema `h2o.savedChatArchiveRequestReceipt.v1`,
  128 KB cap), via the File System Access folder handle. Its `mapReceiptStatus`
  maps the Desktop verdict → Chrome status:
  `validated→queued-on-desktop`, `duplicate→already-queued-duplicate`,
  `rejected→rejected-by-desktop`, `needs-desktop-snapshot→needs-desktop-snapshot`,
  `db-unavailable→db-unavailable`. **No `written` verdict exists.**
- **Status model** `computeSavedChatArchiveStatusV1`
  (`saved-chat-archive-status.studio.js`, pure): maps the Chrome status →
  archive state. Critically `queued-on-desktop → archived` (label **"Archived"**).
  So **"queued" already renders as "Archived"**, and there is no state for
  "package written".
- **Badge** `appendSavedChatArchiveStatusBadgeV1`
  (`saved-chat-archive-status-badge.studio.js`): renders only informative states
  (`archived`, `already-archived`, …) using the status-model label; one-shot read
  on an explicit "Check status" gesture, designed for **no false "archived"** and
  no polling.
- **Materializer** (F.2/F.3): updates only SQLite + `meta_json.materialization`.
  It writes **no receipt** and never touches the receipts folder. This is the gap.

**Receipt mutability / naming:** the scanner writes `receipts/<requestId>.receipt.json`
(for a well-formed UUID requestId) via `plugin:fs|write_text_file` (overwrite),
and the receipt already carries forward-looking `materializeTriggered:false` /
`packageWriteDeferred:true` slots. Each writer owning one named file makes a
**per-writer-immutable, additive-sidecar** model natural.

**Prior decision (F.0 §4):** default to **(a) DB-row-only** for F.1–F.3 (no Chrome
change), with **(b) second receipt / (c) both** deferred to F.4. F.4 now resolves
this.

## Recommended F.4 decision

**Adopt option C (both), implemented additively and non-regressively** — i.e. the
DB row stays authoritative, and Desktop projects the package-written state to
Chrome through an **immutable-sidecar materialization receipt**, with Chrome
gaining an **additive `package-written` read-back substate**. This corresponds to
the user's option **C** (a second/extended read-back for package-written) and
keeps the spirit of **A** (queued still reads as "Archived" — no regression). It
is explicitly **not** a pure **B** relabel (which would rename every currently
"Archived" chat to "Queued on Desktop") and **not** **D** (defer), because the
contract can define the mechanism now while gating the actual Chrome change
behind F.4.2/F.4.3.

**Why this and not the others:**

- **Redefine, don't regress, "Archived."** "Archived" is defined as **"the chat
  is durably captured on Desktop"** — satisfied at `queued-on-desktop`, because
  the content lives as a snapshot in the Desktop SQLite store, which is the
  source of truth. The `.h2ochat` package is a **portable projection** of that
  store state (`manifest.provenance.projectionOnly: true`,
  `sourceOfTruth: desktop-sqlite-store`), not the durability guarantee itself.
  So "Archived" for queued is **honest**, and package-written is a **stronger,
  additive** confirmation — not a precondition for "Archived".
- **Don't choose pure B.** Relabeling `queued-on-desktop` to "Queued on Desktop"
  would change the label of every chat currently shown as "Archived" and would
  leave almost everything stuck pre-"package" because **materialization is still
  a manual operator action** (F.2/F.3) — most requests never get a package.
  Requiring a package for "Archived" only makes sense once materialization is
  automatic/bulk, which is out of scope here.
- **Don't choose pure D.** Deferring entirely leaves the package-written truth
  visible only in Desktop Archive Health; defining C now (contract only) records
  the mechanism + boundary so F.4.2+ can ship it deliberately if product wants
  the Chrome-visible distinction.
- **C respects the Chrome boundary.** Chrome still reads **files only**; the
  sidecar is a Desktop-authored projection of the DB truth, so Chrome learns
  package-written without ever touching SQLite or the package/CAS body.

## Contract

### 1. Product meaning of "Archived"

- **"Archived" = durably captured on Desktop.** It is satisfied as soon as the
  request is `validated`/`queued-on-desktop` (snapshot persisted in the Desktop
  SQLite source-of-truth store). It does **not** require a written `.h2ochat`.
- **"Package written" is a distinct, stronger substate** meaning a portable
  package projection of that snapshot also exists on disk. It is **additive**:
  every package-written request is also archived; not every archived request is
  package-written.
- Chrome must never imply more than the receipt evidence supports: absent a
  materialization receipt, a request is "Archived" (captured), not "package
  written".

### 2. Status vocabulary

Existing states are unchanged; F.4 adds exactly one Chrome-visible state.

| Chrome receipt status | Archive state (status model) | Label | Severity |
|---|---|---|---|
| `delivered-awaiting-desktop` / (delivered, no receipt) | `waiting-for-desktop` | Waiting for Desktop | info |
| `queued-on-desktop` (from `validated`) | `archived` | **Archived** | success |
| **`package-written`** (from `written`, **new**) | **`archived-package-written`** (new) | **Archived · package written** | success |
| `already-queued-duplicate` (from `duplicate`) | `already-archived` | Already archived | success |
| `needs-desktop-snapshot` | `needs-desktop-snapshot` | Needs Desktop snapshot | warn |
| `rejected-by-desktop` | `failed` | Archive failed | error |
| `db-unavailable` | `waiting-for-desktop` | Waiting for Desktop | info |

- The new state is named **`archived-package-written`** (a success substate of
  `archived`), surfaced by a new Chrome receipt status **`package-written`**
  derived from a Desktop materialization receipt verdict `written`.
- Naming rule: `package-written` is the *receipt/Chrome status*;
  `archived-package-written` is the *archive state*. (Keeps the existing
  receipt-status → archive-state two-stage mapping intact.)

### 3. Receipt strategy

- **The original scan receipt is immutable.** `receipts/<requestId>.receipt.json`
  (written by the scanner) is **never** mutated by the materializer; it remains
  the record of the enqueue verdict + timing.
- **Materialization is an additive sidecar receipt.** Desktop writes
  `receipts/<requestId>.materialization.receipt.json`
  (new schema `h2o.savedChatArchiveMaterializationReceipt.v1`) carrying a
  **file-only projection of `meta_json.materialization`**:
  `{ status: "written", requestId, snapshotId, packagePath, contentHash,
  schemaVersion, payloadVersion, writtenAt }`. No transcript/messages/HTML/asset
  bytes; no SQLite handle; no package body — just the same metadata the DB already
  holds.
- **Why sidecar, not overwrite/merge:** keeps the scan receipt immutable, gives
  each Desktop writer sole ownership of its own file (no read-modify-write race
  between a re-scan and a materialization), and is purely additive (absence of
  the sidecar = today's behavior). The existing `materializeTriggered` slot on the
  scan receipt may *additionally* be flipped to `true` by Desktop for forward
  hinting, but the sidecar — not the scan receipt — is the authoritative
  Chrome-visible package-written signal.
- **Fits existing capabilities (no new grant):** the sidecar name still ends in
  `.receipt.json`, so it matches the existing Desktop write grant
  `receipts/*.receipt.json`; Chrome reads it through the **same** granted folder
  handle it already uses for the scan receipt. No capability change is required by
  F.4.
- **Read-back without Chrome SQL:** Chrome's read-back additionally attempts
  `receipts/<requestId>.materialization.receipt.json`; if present, valid
  (schema + size cap), and `status: written`, the model resolves
  `package-written`; otherwise it falls back to the scan-receipt status exactly as
  today. The package-written truth thus reaches Chrome via a Desktop-authored
  **file projection**, never via SQLite or package inspection.

### 4. Chrome authority boundary (hard invariants)

- Chrome may read **receipt files only** (the scan receipt and the materialization
  sidecar), via the user-granted archive-folder handle.
- Chrome must **not** read the Desktop SQLite database.
- Chrome must **not** inspect the `.h2ochat` package or CAS blobs directly. (It
  may read the sidecar receipt's *metadata fields* — packagePath/contentHash — but
  must not open the package directory or asset bytes.)
- Chrome must **not** write packages, CAS, or SQLite, and must not write any
  receipt (it writes only `inbox/*.request.json`).
- No native messaging, no localhost relay, no service-worker transport for archive
  state.

### 5. Desktop authority boundary

- Desktop owns the materializer, the package writer, the CAS, the SQLite DB
  (`saved_chat_archive_requests` + `meta_json.materialization`), Archive Health,
  **and** the new materialization sidecar receipt write.
- The DB row + `meta_json.materialization` remain the **source of truth**; the
  sidecar receipt is a **projection** for Chrome read-back.
- Desktop remains the sole writer of `.h2ochat` packages; Chrome request content
  is never authoritative.

### 6. UI behavior

- **`queued-on-desktop` keeps the label "Archived."** No regression: every chat
  currently shown as "Archived" stays "Archived".
- **`archived-package-written` gets a distinct success label** — recommended
  **"Archived · package written"** (alternative: a checkmark badge with a stronger
  tooltip "Portable package written"). It is added to the badge's render-worthy
  state map with `success` severity.
- **Surfaced on the existing explicit "Check status" gesture**, not via a new
  always-on poll: the badge stays one-shot and non-noisy, consistent with its
  "no false archived" design. Reading the sidecar is part of the same read-back
  the gesture already performs.
- **No new global/floating buttons, no row-level package mutation from Chrome.**

### 7. Migration / backward compatibility

- **Existing `validated` (queued) receipts** — unchanged: `queued-on-desktop →
  archived` ("Archived"). No migration needed.
- **Existing `duplicate` receipts** — unchanged: `already-archived`.
- **Existing `written` DB rows with no materialization sidecar** (e.g. F.3's
  `f7cd514a-…`, written before F.4.2 exists) — render "Archived" from the scan
  receipt until a sidecar is written. F.4.2 must include a **one-shot, operator-run
  Desktop reconcile** that backfills sidecar receipts for already-`written` DB
  rows (read DB `written` rows → write the sidecar projection; **never** overwrite
  the immutable scan receipt; idempotent; no package rewrite).
- **Legacy local delivered entries with `requestId: null`** (pre-requestId E.1.x):
  cannot read back any receipt; they stay at `archive-requested` (legacy) and
  cannot reach `package-written`. Acceptable — unchanged by F.4; not worsened.
- **Forward compatibility:** an older Chrome that does not know the sidecar simply
  ignores it and shows "Archived" from the scan receipt — the change is additive
  and degrades gracefully both directions.

### 8. Implementation phases after F.4

| Phase | Deliverable |
|---|---|
| **F.4.1** | Contract **validator** — asserts the vocabulary (`package-written` / `archived-package-written`), the immutable-scan-receipt + additive-sidecar rule, and the Chrome boundary (no SQLite read, no package/CAS body read, files-only). Static, no runtime change. |
| **F.4.2** | Desktop **materialization sidecar receipt** writer (in the materializer's write path or a thin Desktop helper) + the one-shot **reconcile/backfill** for already-`written` rows. Desktop-only; fits existing `receipts/*.receipt.json` capability. |
| **F.4.3** | Chrome **read-back model update** — extend `readSavedChatArchiveRequestReceiptV1` to additionally read the sidecar; add `package-written` to the reader `mapReceiptStatus`; add `archived-package-written` to `computeSavedChatArchiveStatusV1` + the badge label/severity/render map. Additive, files-only. |
| **F.4.4** | **Runtime smoke** — a `written` request gains a sidecar; Chrome read-back shows `archived-package-written` ("Archived · package written"); a queued-but-unwritten request still shows "Archived"; backfill reconcile proven on F.3's `f7cd514a-…`. |
| **F.4.5** | Phase F.4 **closure** note. |

## Boundaries held (this contract)

- Docs/evidence only — **no** runtime code, validators, capabilities, Chrome
  runtime/service-worker, Desktop runtime, scanner, materializer, or writer
  changed.
- Chrome remains intent / read-back (files-only); Desktop remains authoritative.
- No native messaging, no WebDAV/cloud/sync, no polling/watcher/daemon.
- No `S0F0j` / `S0F1j` edits. No sync/appearance/ribbon dirty files touched. No
  unrelated files staged.

## Verdict

**F.4 CONTRACT — NOT IMPLEMENTED.** Recommended decision: **option C, additive and
non-regressive** — keep "Archived" meaning "durably captured on Desktop" (so
`queued-on-desktop` stays "Archived"), and project the F.3 package-written state
to Chrome through an **immutable-scan-receipt + additive Desktop materialization
sidecar receipt**, read by Chrome as **files only** to surface a distinct
`archived-package-written` ("Archived · package written") substate on the existing
check-status gesture. The DB row stays authoritative; Chrome never reads SQLite or
the package body; the change is backward compatible and fits existing capabilities.

## Recommended next step after F.4

Proceed to **F.4.1** — author the contract validator that locks the vocabulary
(`package-written` / `archived-package-written`), the immutable-scan-receipt +
additive-sidecar receipt rule, and the Chrome files-only / no-SQLite / no-package-
body boundary — before any F.4.2 Desktop sidecar writer or F.4.3 Chrome read-back
change. Implementation (F.4.2/F.4.3) should proceed only if product confirms it
wants the Chrome-visible `package-written` distinction now (vs. leaving it to
Desktop Archive Health) given materialization is currently a manual operator
action.
