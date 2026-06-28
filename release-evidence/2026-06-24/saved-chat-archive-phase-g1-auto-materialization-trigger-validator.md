# Saved Chat Archive — Phase G.1 Auto-Materialization Trigger Validator

Date: 2026-06-28

Status: **G.1 AUTO-MATERIALIZATION TRIGGER VALIDATOR — PASSED**

Lane: Chat Saving Architecture (Phase G — automatic scanner-to-materializer
trigger policy).

This slice adds a **static contract validator only** — no runtime implementation.
It locks the G.0 contract (`558a653`) and asserts the current runtime still
matches the pre-implementation state, so any future G.2/G.3 batch action must
consciously update this validator.

## Baseline

```text
14aba6e  docs(studio): close saved chat archive phase f
558a653  docs(studio): define archive auto materialization trigger contract   (G.0)
```

## Validator purpose

`tools/validation/studio/validate-saved-chat-archive-auto-materialization-trigger-v1.mjs`
asserts, statically (reads source/doc text; no runtime, DB, or network):

1. The G.0 contract exists, is marked **NOT IMPLEMENTED**, and encodes option C
   (bounded Desktop-only "Materialize validated" operator batch), keeps the scanner
   enqueue-only, rejects watcher/daemon, defers the scanner-coupled
   `materializeValidated:true` flag, keeps Chrome intent/read-back only, and pins
   eligibility / `overwrite:false` / bounded-limit+hard-cap / result-count summary /
   sequential-no-infinite-retry.
2. The **current** runtime still matches the pre-implementation state — scanner
   enqueue-only and never calls the materializer; F.2 single-request action remains
   Desktop-only and explicit; Chrome runtime references neither materializer nor
   writer; `S0F0j`/`S0F1j` untouched; no webdav/sync/native/localhost relay; no
   polling/watcher/daemon in the trigger modules; and the F.4 package-written
   sidecar/read-back stays deferred (F.4.1 lock intact).

It is the G.1→G.2 gate (the same pattern as F.1→F.2 and F.4.1).

## G.0 policy summary (locked by this validator)

- **Option C** — an explicit, Desktop-only, **bounded "Materialize validated"
  operator batch** that lists `validated` rows and routes each through the existing
  materializer; keep **A** (manual single, F.2) as baseline; **defer B** (scanner
  `materializeValidated:true`); **reject D** (background daemon/watcher).
- **Eligibility:** `validated` only → `written`; `written` → `already-written`
  (idempotent); `duplicate`/`rejected`/`needs-desktop-snapshot` → `not-eligible`;
  `failed` is **not** auto-re-armed (counted, not retried in-run).
- **Safety:** `overwrite:false` always; bounded per-run limit + hard cap; a
  written/already-written/failed/not-eligible result summary; sequential execution;
  no infinite retry; no passive Chrome-triggered write.
- **Boundaries:** Chrome intent/read-back only; Desktop owns scanner/materializer/
  writer/DB/Archive Health; scanner stays enqueue-only; no daemon/watcher in
  G.0/G.1; F.4 sidecar / Chrome `package-written` badge stay deferred.

## Selected product assumptions (G.0 amendment — docs-only, for G.2)

G.0 §4 required a bounded per-run limit + hard cap but illustrated them with
example values ("e.g. 25 … ≤ 200"). G.1 selects the concrete values requested for
G.2; this is a **documentation-only** refinement of G.0's examples and changes **no
runtime behavior** (nothing is implemented yet):

- **Default batch limit: 10** per "Materialize validated" click.
- **Hard cap: 50** (operator may raise the per-run count up to this ceiling; no
  "materialize all" / unbounded run).
- **UI home:** an extension of the **existing F.2 Desktop archive materializer
  operator card** in the **Archive Health / Diagnostics** area — not a new surface
  and not a global floating button.

These supersede G.0's illustrative 25/200 for G.2 planning. The validator asserts
only that G.0 *requires* a bounded limit + hard cap (not the specific numbers); the
concrete 10/50 are recorded here and will be enforced by the G.2 action + its
validator when implemented.

## Invariants asserted (20 checks: 12 `[G.1]` + 8 `[INVARIANT]`)

**Contract (`[G.1]`):** G.0 exists; marked NOT IMPLEMENTED; recommends option C
(bounded Desktop-only "Materialize validated"); keeps scanner enqueue-only; rejects
watcher/daemon; defers `materializeValidated:true`; keeps Chrome intent/read-back
only; defines eligibility (validated / already-written / not-eligible /
needs-desktop-snapshot / failed-not-re-armed); requires `overwrite:false`; requires
bounded per-run limit + hard cap; requires the written/already-written/failed/
not-eligible result summary; requires sequential/bounded execution with no infinite
retry.

**Current runtime boundaries (`[INVARIANT]`):** scanner does not call the
materializer; scanner stays enqueue-only (`packageWriteDeferred:true`,
`materializeTriggered:false`, no package write); F.2 action remains Desktop-only +
explicit; no Chrome runtime references the materializer/writer/SQLite; `S0F0j`/
`S0F1j` do not reference the auto-materialization path; no webdav/sync/native/
localhost relay in the trigger modules; no polling/watcher/daemon tokens in
materializer/scanner/F.2 action; and the package-written sidecar/read-back stays
deferred (F.4.1 lock intact — no runtime sidecar, status model has no
`archived-package-written`).

## Current runtime status

- **No batch action implemented yet** — there is no "Materialize validated" batch
  anywhere; only the F.2 single-request operator action exists.
- **Scanner remains enqueue-only** (`packageWriteDeferred:true`,
  `materializeTriggered:false`) and never calls the materializer.
- **Materializer remains Desktop-only** and idempotent; it is invoked only by the
  explicit F.2 operator action.
- The F.4 package-written sidecar / Chrome badge remain deferred.

## Validation results

```text
node --check (new validator)                                  syntax OK
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 20 checks
validate-saved-chat-archive-materializer-trigger-v1.mjs       PASS 24 checks
validate-saved-chat-archive-package-written-status-v1.mjs     PASS 15 checks
validate-saved-chat-archive-materializer-v1.mjs               all 14 checks passed
git diff --check / --cached --check                           clean
```

## Boundaries preserved

- **Validator/evidence only** — no batch action, no scanner/materializer/writer
  change, no Chrome reader/status/badge change, no capability change.
- Chrome remains intent / read-back; Desktop remains authoritative; scanner stays
  enqueue-only.
- No Chrome runtime/service-worker touched; no sync/WebDAV/native messaging/
  localhost relay; no polling/watcher/daemon.
- No `S0F0j` / `S0F1j` edits. No sync/appearance/ribbon dirty files touched. No
  unrelated files staged.

## Verdict

**G.1 AUTO-MATERIALIZATION TRIGGER VALIDATOR — PASSED.** The G.0 contract is
statically locked and the current runtime provably matches the pre-implementation
state: no "Materialize validated" batch exists, the scanner stays enqueue-only and
never calls the materializer, Chrome retains no materializer/writer authority, and
the F.4 package-written sidecar remains deferred.

## Recommended next step after G.1

Proceed to **G.2** — the Desktop bounded **"Materialize validated" batch action**
(an extension of the F.2 operator card in Archive Health / Diagnostics): list up to
the per-run limit of `validated` rows (**default 10, hard cap 50**), materialize
each via the existing materializer with `overwrite:false`, render a
written/already-written/failed/not-eligible summary, and remain a single explicit
operator gesture (no daemon, no scanner coupling). When G.2/G.3 ship, this validator
must be updated in lock-step (flip the "no batch action" invariants to assert the
bounded batch action + its limit/cap/summary), mirroring the F.1→F.2 gate flip.
