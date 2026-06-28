# Saved Chat Archive — Phase G.2 Bounded "Materialize Validated" Action

Date: 2026-06-28

Status: **G.2 BOUNDED MATERIALIZE VALIDATED ACTION — PASSED**

Lane: Chat Saving Architecture (Phase G — automatic scanner-to-materializer
trigger policy).

This slice implements the G.0/G.1 **option C** decision: a bounded, Desktop-only,
explicit operator **"Materialize validated"** batch, added to the existing F.2
materializer operator card. The scanner stays enqueue-only; the batch simply
routes a bounded set of `validated` rows through the existing materializer.

## Baseline

```text
14aba6e  docs(studio): close saved chat archive phase f
558a653  docs(studio): define archive auto materialization trigger contract   (G.0)
0d99931  test(studio): validate archive auto materialization trigger contract (G.1)
```

## Implementation summary

The batch was added to the existing F.2 module
`saved-chat-archive-materializer-action.studio.js` (version `0.1.0-phase-f-2` →
`0.2.0-phase-g-2`). **The single-request materialize action is unchanged** (the F.2
trigger validator still passes 24 checks).

New pure batch function `materializeValidatedBatch({ limit })`:

- **Desktop-only** — early `isDesktopCapable()` gate; on Chrome it returns a safe
  empty result (`desktop:false`) and makes no calls.
- **Bounded limit** — `normalizeBatchLimit` clamps to `[1, MAX_BATCH_LIMIT]` with
  default `DEFAULT_BATCH_LIMIT`: **default 10, hard cap 50**. No "materialize all".
- **Lists validated rows read-only** — reuses `loadValidatedRequests({ limit })`
  → `listSavedChatArchiveRequestsV1({ status:'validated', limit })`; takes at most
  `limit` rows.
- **Sequential** — a `reduce` Promise-chain materializes one row at a time
  (`await` each before the next); **no `Promise.all` / parallel fan-out**.
- **Routes each requestId through the existing materializer** — calls
  `materializeRequest({ requestId: row.requestId })`, i.e. the same single-request
  bounded path (`materializeSavedChatArchiveRequestV1({ requestId })`,
  Desktop-gated, **`overwrite` never passed**).
- **Safe empty** — when there are no validated rows it returns immediately with
  `total:0, attempted:0` and **makes no materializer calls**.
- **Result summary** — returns
  `{ ok, desktop, limit, total, attempted, counts, results, error }` where `counts`
  is keyed by status and `results` is a compact per-request list
  (`{ requestId, status, ok }`).

The materializer is **not** modified; `failed` rows are surfaced by the materializer
as-is, counted, and **not retried / not auto-re-armed** by the batch.

## Files changed

- `src-surfaces-base/studio/ingestion/saved-chat-archive-materializer-action.studio.js`
  — added the bounded batch (function + UI + export); single-request action
  unchanged. (Already loaded by `studio.html` and packed since F.2 — no new wiring.)
- `tools/validation/studio/validate-saved-chat-archive-auto-materialization-trigger-v1.mjs`
  — added 8 `[G.2]` assertions (gate flipped from contract-only to batch-present).
- `release-evidence/2026-06-24/saved-chat-archive-phase-g2-bounded-materialize-validated-action.md`
  (this note).

No scanner / materializer / package-writer / projector / CAS / store / Chrome /
capability / `S0F0j` / `S0F1j` change.

## UI location

In **Settings → Diagnostics**, the existing **F.2 "Materialize Saved Chat Archive
Request" operator card** (a sibling beneath the read-only Archive Health card).
Below the unchanged single-request controls, a new row adds a **"Batch limit"**
number input (default 10, `min 1` / `max 50`) and a **"Materialize validated"**
button, followed by a batch result block showing **limit used · attempted / total**,
a count-pill summary, and a compact `status · requestId` per-request list. Data
attributes: `data-archive-materializer-batch-run`, `-batch-limit`, `-batch-result`.
No global floating button; no Chrome row-level mutation.

## Default limit 10 / hard cap 50

`DEFAULT_BATCH_LIMIT = 10`, `MAX_BATCH_LIMIT = 50`. The operator may raise the
per-run count up to 50 via the input; any value is clamped to `[1, 50]`; an empty/
invalid input falls back to 10.

## Sequential execution

Rows are materialized **one at a time** via a `reduce` Promise-chain — each
`materializeRequest` resolves before the next begins. There is no `Promise.all`,
no concurrency, and no retry loop, so a re-click is safe (already-`written` rows
return `already-written`).

## Count summary vocabulary

`counts` always carries these keys (0 when unused):
`written`, `already-written`, `failed`, `not-eligible`, `needs-desktop-snapshot`,
`db-unavailable`, `not-found`, `other` — plus top-level `total`, `attempted`,
`limit`, and the `results[]` list. Any unrecognized status falls into `other`.

## Why the scanner remains enqueue-only

Option C deliberately keeps the scanner as "validate + enqueue + receipt" and does
**not** wire `materializeValidated:true` (option B). The batch is a *separate*
explicit operator gesture that reuses the listing + materializer; the scanner never
calls the materializer or writes packages. This preserves the boundary the F.1/F.2
and G.1 validators lock, keeps a routine scan cheap and side-effect-free, and keeps
package writes behind an explicit operator click.

## Why Chrome authority did not expand

The batch lives entirely in the Desktop-gated operator card and calls only the
Desktop materializer. Chrome has no Tauri runtime, performs no SQL/CAS/package
writes, and gains no new read-back: the F.4 materialization sidecar / Chrome
`package-written` badge stay deferred (F.4.1 lock intact). The batch writes no
receipt and changes no Chrome badge/status semantics.

## Validation results

```text
node --check (action module, trigger validator)               all OK
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs  PASS 28 (12 [G.1] + 8 [INVARIANT] + 8 [G.2])
validate-saved-chat-archive-materializer-trigger-v1.mjs       PASS 24 checks   (single-request action unchanged)
validate-saved-chat-archive-package-written-status-v1.mjs     PASS 15 checks   (F.4 sidecar still deferred)
validate-saved-chat-archive-materializer-v1.mjs               all 14 checks passed
validate-studio-archive-health-ui.mjs                         all 19 checks passed
git diff --check / --cached --check                           clean
```

## Runtime smoke — DEFERRED to G.3

The batch is Tauri-gated and performs **real package writes**. The runtime smoke
must run in Desktop Studio / Tauri DevTools, which this environment cannot drive
programmatically (the Tauri WKWebView exposes no remote debug port — same
constraint proven in F.3, where the operator ran the DevTools snippets). G.3 is the
dedicated runtime phase, so the live batch smoke is deferred to it rather than run
during this implementation slice. Static + behavioral validation (28 checks +
`node --check`) covers the batch logic and boundaries.

Operator snippet for G.3 (bounded, limit 1 — does not run the scanner):

```js
// Desktop Studio DevTools (Tauri):
const api = H2O.Studio.archiveMaterializerAction;
api.isDesktopCapable();                                  // expect true
const summary = await api.materializeValidatedBatch({ limit: 1 });
JSON.stringify(summary, null, 2);
// expect: ok:true, desktop:true, limit:1, total:1, attempted:1,
//         counts has written:1 (or already-written:1), results:[{requestId,status,ok}]
// re-run -> the same row returns already-written (idempotent, no duplicate package).
```

(Use `limit: 1` or `2` only — do not run a large batch. Re-running materializes the
most-recently-updated `validated` rows; an already-`written` row safely returns
`already-written`.)

## Boundaries preserved

- Scanner unchanged (enqueue-only); no `materializeValidated:true` coupling.
- Materializer internals unchanged; `overwrite:false` always; no package overwrite.
- No watcher/poller/daemon (sequential reduce-chain, explicit click only).
- No Chrome runtime/service-worker change; no Chrome SQL/CAS/package writes; no
  package-written badge.
- No F.4 sidecar/read-back change; no capability change; no sync/WebDAV/native
  messaging.
- No `S0F0j` / `S0F1j` edits. No sync/appearance/ribbon dirty files touched. No
  unrelated files staged.

## Verdict

**G.2 BOUNDED MATERIALIZE VALIDATED ACTION — PASSED.** A bounded, Desktop-only,
explicit "Materialize validated" batch (default 10, hard cap 50, sequential,
`overwrite:false`, full result-count summary) routes validated rows through the
existing materializer without touching the scanner or expanding Chrome authority;
the single-request action and all standing boundaries are unchanged. Runtime smoke
is deferred to G.3.

## Recommended next step after G.2

Proceed to **G.3** — Desktop runtime smoke: with a safe set of `validated` rows,
run the bounded batch at `limit 1`–`2` in Desktop Studio, confirm rows reach
`written` (and `already-written` on re-run), verify the per-request summary +
on-disk packages + DB `meta_json.materialization`, and confirm no scanner run and
no package overwrite. After G.3, **G.4** decides whether to proceed to the F.4
Chrome-visible `package-written` sidecar (now that materialization can be run in
routine bounded batches) or keep it Desktop-only.
