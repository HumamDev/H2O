# Saved Chat Archive — Phase G Closure

Date: 2026-06-29

Status: **PHASE G CLOSED — BOUNDED AUTO-MATERIALIZATION PROVEN**

Lane: Chat Saving Architecture (Phase G — automatic scanner-to-materializer
trigger policy).

This is a docs/evidence-only note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes. It closes Phase G by recording what the
G.0–G.3 chain proved and what was deliberately deferred.

## Scope

Phase G answered "should the scanner automatically materialize?" with the
**bounded, explicit, Desktop-only** policy from G.0 (option C): keep the scanner
enqueue-only, and add a **"Materialize validated"** operator batch that routes a
bounded set of `validated` rows through the existing materializer. G.2 implemented
it; G.3 proved it end to end on a real request. No background daemon, no
scanner-coupled flag, no Chrome authority change.

## Closed Chain

```text
558a653  docs(studio): define archive auto materialization trigger contract   G.0  contract
0d99931  test(studio): validate archive auto materialization trigger contract G.1  validator
23dd24d  feat(studio): add bounded archive materialize validated action       G.2  bounded batch action
47e6a37  docs(studio): record archive bounded batch runtime smoke             G.3  runtime smoke
```

Evidence notes (all under `release-evidence/2026-06-24/`):
`…phase-g0-auto-materialization-trigger-contract.md`,
`…phase-g1-auto-materialization-trigger-validator.md`,
`…phase-g2-bounded-materialize-validated-action.md`,
`…phase-g3-bounded-batch-runtime-smoke.md`, and this closure.

## What Phase G Proves

- **The scanner remains enqueue-only.** It validates/enqueues and writes the
  immutable scan receipt (`packageWriteDeferred:true`, `materializeTriggered:false`)
  and never calls the materializer or writes packages. Option B
  (`materializeValidated:true`) was deliberately **not** taken.
- **Desktop has an explicit bounded "Materialize validated" operator batch.**
  `H2O.Studio.archiveMaterializerAction.materializeValidatedBatch({ limit })`, added
  to the existing F.2 operator card in Archive Health / Diagnostics — an explicit
  click, no global button, no Chrome row mutation.
- **Batch default is 10, hard cap 50.** `DEFAULT_BATCH_LIMIT = 10`,
  `MAX_BATCH_LIMIT = 50`; any value is clamped to `[1, 50]`; no "materialize all".
- **Batch uses `listSavedChatArchiveRequestsV1({ status:'validated', limit })`** to
  enumerate validated rows (read-only) in `updated_at DESC, received_at DESC` order.
- **Batch runs sequentially** — a `reduce` Promise-chain materializes one row at a
  time (no `Promise.all` / parallel fan-out, no retry loop).
- **Batch routes each requestId through the existing materializer** — calls
  `materializeRequest({ requestId })` → `materializeSavedChatArchiveRequestV1({ requestId })`,
  the same Desktop-gated single-request path; the materializer is unmodified.
- **No `overwrite:true`** — `overwrite` is never passed; existing `*.h2ochat`
  packages are never clobbered.
- **No scanner auto-trigger, no watcher/poller/daemon** — the batch runs only on an
  explicit operator click.
- **No Chrome writes; no F.4 sidecar/package-written badge** — the batch updates
  only the DB + package (Desktop authority); Chrome read-back is unchanged.

## G.3 Runtime Proof

```text
selected requestId: ee16950d-bf65-481b-a4fd-1ff5d053d2ff
title:              ☎️ Investment in AI Tools
snapshotId:         snap_1778516336177_wy9txv06
batch limit:        1   (deterministic strict-top validated row)
batch result:       written: 1   (results: [{ ee16950d…, written, ok:true }])
package path:       archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat
contentHash:        sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec
idempotency:        direct same-request materializer call -> already-written (no duplicate)
package count:      17 -> 18
DB movement:        validated 57 -> 56,  written 4 -> 5
residue:            no failed / db-unavailable / writing rows for this request
scanner:            total request count unchanged (71) -> scanner was NOT run
sidecar:            no materialization sidecar receipt was written
```

Disk verification: all four package files present (no `assets/`, `manifest.assets:[]`),
every recomputed sha256 matched the manifest, and `contentHash = sha256(snapshot.json)`
= the materializer result = `meta_json.materialization.contentHash`. (Full proof in
the G.3 evidence note.)

## Environment Caveat (recorded; NOT a G.3 failure)

- The G.3 runtime used dev origin **`http://127.0.0.1:1431`** (the dev server was
  re-packed via `pack-studio.mjs` and restarted on a new port after a stale
  pre-G.2 dist was found).
- The **committed capability source currently records the `1430` scope only**
  (`remote.urls: http://127.0.0.1:1430/* , http://localhost:1430/*`), verified
  clean — Phase G did not modify capabilities.
- SQL/FS succeeded in the running runtime on 1431 (the running binary's compiled
  ACL admitted 1431), and the evidence captured the caveat. **This is not a G.3
  failure** — the smoke ran, wrote a real package, and was fully verified.
- For future runtime reproducibility, either **pin the dev server to 1430** or
  **separately extend the capability `remote.urls`** to the active dev port. This is
  a separate, non-blocking cleanup.

## Boundaries Preserved

- **Chrome remains intent / read-back only** — no SQL/CAS/package writes; no
  Chrome-initiated materialization.
- **Desktop owns the scanner, materializer, package writer, DB, and Archive
  Health** — and remains the sole package writer.
- **No Chrome SQL / CAS / package writes.**
- **No scanner-coupled `materializeValidated:true`** — option B not taken; scanner
  stays enqueue-only.
- **No watcher / poller / daemon** — explicit operator click only.
- **No sync / WebDAV / cloud / native messaging.**
- **No `S0F0j` / `S0F1j` edits.**
- **No package overwrite** — `overwrite:false` throughout; idempotent re-call
  returned `already-written` and wrote nothing.

## Deferred Work

- **F.4.2 — Desktop materialization sidecar receipt + backfill** remains deferred.
- **F.4.3 — Chrome `package-written` read-back** remains deferred.
- **Chrome-visible "Archived · package written"** remains a **product decision**
  (worthwhile mainly now that materialization can run in routine bounded batches —
  the natural trigger for revisiting F.4.2/F.4.3).
- **Dev-port capability reproducibility cleanup** (pin 1430 or extend `remote.urls`)
  remains separate.
- **Import / export / recovery** remains separate.
- **Sync / cloud / WebDAV package propagation** remains separate (the archive/CAS
  root stays distinct from the Sync lane).

When/if F.4.2/F.4.3 are taken up, the F.4.1 and auto-materialization validators must
be updated in lock-step (flip the "no sidecar implemented" invariants), mirroring
the F.1→F.2 and G.1→G.2 gate flips.

## Validation

Docs-only; no runtime code or validators changed. Re-run at closure:

```text
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs   PASS 28 checks
validate-saved-chat-archive-materializer-trigger-v1.mjs           PASS 24 checks
validate-saved-chat-archive-package-written-status-v1.mjs         PASS 15 checks
git diff --check / --cached --check                               clean
```

## Verdict

**PHASE G CLOSED — BOUNDED AUTO-MATERIALIZATION PROVEN.** An explicit,
Desktop-only, bounded "Materialize validated" operator batch (default 10, hard cap
50, sequential, `overwrite:false`, full result-count summary) routes validated rows
through the existing materializer without touching the scanner or expanding Chrome
authority; G.3 proved it end to end on a real request (`written` → idempotent
`already-written`), verified across disk / DB / manifest / diagnostics. The
Chrome-visible `package-written` distinction stays defined-but-deferred.

## Recommended Next Milestone

Treat the next milestone as a **product decision** at the F.4 boundary: now that
materialization is routine (manual single + bounded batch, both proven), decide
whether to ship the Chrome-visible **`package-written`** sidecar + read-back
(F.4.2 Desktop materialization sidecar/backfill → F.4.3 Chrome read-back →
`archived-package-written` badge) or to keep package-written state Desktop-only in
Archive Health. If shipping, F.4.2 is the next implementation step (with the F.4.1
validator flipped in lock-step). Independently, resolve the dev-port capability
reproducibility cleanup so runtime smokes pass on a fresh build without an
out-of-source ACL.
