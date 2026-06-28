# Saved Chat Archive — Phase F.1 Materializer Trigger Validator

Date: 2026-06-28

Status: F.1 STATIC CONTRACT / VALIDATOR — PASSED

Lane: Chat Saving Architecture (Phase F — materialization trigger).

This is a static/contract + validator slice. It adds one validator and this
evidence note. **No runtime code was modified** (no materializer, scanner,
writer, CAS, store, Chrome, capabilities, sync, or UI changes). No operator UI;
no Archive Health button; no Chrome changes.

## Baseline

```text
5f267bd  docs(studio): close saved chat archive phase e        (Phase E closed)
046089a  docs(studio): define archive materializer trigger contract   (F.0)
```

## Goal

Lock the materializer **trigger boundary** with a static validator *before* any
operator UI is added (F.2). The F.0 investigation established that the
materializer already exists (D.2C), so F.1 is a contract/validator slice — not
new writer code.

## Investigation Summary

### The materializer already exists and is already behaviorally covered

`H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1({ requestId, overwrite=false })`
lives at
`src-surfaces-base/studio/ingestion/saved-chat-archive-materializer.tauri.js`
and is **Desktop/Tauri-only**. Its internals (state machine, idempotency, writer
call shape, failure handling) are behaviorally tested by the existing
`validate-saved-chat-archive-materializer-v1.mjs` (14 checks, in-VM with mock
`plugin:sql` + mock resolve/writer). F.1 deliberately does **not** duplicate that
— it adds a *boundary* validator for the cross-module invariants and phase-gates
that Phase F must preserve.

### Current request DB states (read-only snapshot)

`saved_chat_archive_requests` on the live Desktop DB:

```text
needs-desktop-snapshot   7
rejected                 3
validated               58
written                  3
```

The 3 `written` rows are prior D.2C materializer smoke output; the 58 `validated`
rows are E.x-enqueued requests eligible to materialize. This confirms the
eligibility surface the trigger will route into.

### How `meta_json.materialization` is written

`updateQueueRow(requestId, status, materializationPatch, currentMeta, snapshotIdOpt)`
does a shallow merge:

```text
materialization = Object.assign({}, meta.materialization, materializationPatch)
newMeta         = Object.assign({}, meta, { materialization })
UPDATE saved_chat_archive_requests SET status=?, updated_at=?, meta_json=? [, snapshot_id=?] WHERE request_id=?
```

So materialization metadata is **additive within `meta_json.materialization`** and
the only columns written are `status`, `updated_at`, `meta_json`, and
(conditionally) `snapshot_id`. On success the patch carries
`{ packagePath, schemaVersion, payloadVersion, contentHash, snapshotId, writtenAt,
processingStartedAt, processingFinishedAt, overwrite:false }`; on failure
`{ errorCode, errorMessage, ... }`. A live `written` row confirms the shape:

```json
{ "materialization": { "packagePath": "archive/packages/d2c_request_materializer_chat_1782334630557.h2ochat",
  "schemaVersion": 2, "payloadVersion": 2, "contentHash": "sha256-77f08036…" } }
```

### Is package path / content hash returned in the materializer result?

**Yes.** On `written` (and idempotent `already-written`) the result carries a
`package` object:

```json
{ "packagePath": "...", "schemaVersion": 2, "payloadVersion": 2,
  "contentHash": "sha256-…", "snapshotId": "...", "writtenAt": "..." }
```

The result also carries explicit boundary markers `chromeRuntime:false`,
`syncTransport:false`, `packageWriteDeferred:false`.

### Can existing archive diagnostics see materialized packages?

**Yes.** `saved-chat-archive-diagnostics.tauri.js` (C5) inventories and
hash/asset-validates packages under `$APPLOCALDATA/archive/packages/*.h2ochat`,
read-only. The packages directory currently holds materialized `*.h2ochat`
packages on disk, so Archive Health can already *see* a materialized package — it
just cannot *trigger* materialization (its boundary forbids mutation). This is
why F.2's operator action must be a separate wiring, leaving diagnostics
read-only.

## Validator Summary

New file:
`tools/validation/studio/validate-saved-chat-archive-materializer-trigger-v1.mjs`
— **static** (reads source, asserts patterns; no runtime import, no DB, no
network). Checks are labeled `[INVARIANT]` (must always hold) or `[F.1-GATE]` (a
point-in-time lock that F.2 will intentionally flip and update here).

17 checks, mapped to the F.1 requirements:

| # | Requirement | Check |
|---|---|---|
| 1 | Module exists + exports `materializeSavedChatArchiveRequestV1` | `[INVARIANT]` registration + studio.html loader |
| 2 | Desktop/Tauri-only | `[INVARIANT]` `detectTauri` gate, returns when not Tauri |
| 3 | Eligible states (validated eligible / written idempotent / failed·duplicate·needs-snapshot not eligible) | `[INVARIANT]` eligibility gate + no failed/duplicate write-branch |
| 4 | Calls package writer only, `overwrite:false` | `[INVARIANT]` single `writeSavedChatPackageV1({snapshotId,overwrite:false})`, no content leak; + default `overwrite=false`; + queue-table-only writes |
| 5 | No Chrome delivery/read-back calls | `[INVARIANT]` bans 6 Chrome APIs; result `chromeRuntime:false`; Chrome mv3 makes no package/CAS/SQLite write & never calls materializer |
| 6 | Scanner enqueue-only (`packageWriteDeferred:true`, `materializeTriggered:false`) | `[INVARIANT]` flags present, never `materializeTriggered:true`, scanner calls neither materializer nor writer |
| 7 | No watcher/poller/daemon | `[INVARIANT]` no `setInterval`/`MutationObserver`/`requestAnimationFrame` in materializer or scanner |
| 8 | No Chrome package/CAS/SQLite/store writes | `[INVARIANT]` covered by checks 4–5 (queue-table-only; Chrome mv3 write-free) |
| 9 | No `S0F0j`/`S0F1j` edits | `[F.1-GATE]` neither mega-file wires the materializer |
| 10 | No Archive Health mutation UI yet | `[F.1-GATE]` health UI helper does not call the materializer |
| 11 | No WebDAV/cloud/sync/native/relay | `[INVARIANT]` bans sync/webdav/native-messaging/localhost/ws/fetch |
| 12 | Result vocabulary covered | `[INVARIANT]` all of `written`/`already-written`/`failed`/`needs-desktop-snapshot`/`db-unavailable`/`not-eligible`/`not-found` |

(Additional `[F.1-GATE]`: Archive diagnostics remains read-only — does not call
the materializer.)

The `[F.1-GATE]` checks are point-in-time locks proving no trigger has been wired
prematurely. When F.2 adds the contracted Archive Health operator action, that
phase will intentionally flip the health-UI gate and update this validator.

## Files Changed

- `tools/validation/studio/validate-saved-chat-archive-materializer-trigger-v1.mjs` (new validator)
- `release-evidence/2026-06-24/saved-chat-archive-phase-f1-trigger-validator.md` (this note)

No runtime code changed.

## Validation Results

```text
node --check validate-saved-chat-archive-materializer-trigger-v1.mjs   exit 0 (syntax ok)
validate-saved-chat-archive-materializer-trigger-v1.mjs                PASS 17 checks
validate-saved-chat-archive-status-badge-v1.mjs                        PASS 30 checks
validate-saved-chat-archive-status-v1.mjs                              PASS 19 checks
validate-saved-chat-archive-materializer-v1.mjs (regression)           all 14 checks passed
git diff --check                                                       clean (exit 0)
git diff --cached --check                                              clean (exit 0)
```

## Boundaries Held

- No runtime materializer change (validator exposed no bug).
- No UI added; Archive Health UI untouched.
- No Chrome runtime / service-worker change.
- No Desktop capabilities, sync, package writer/projector/CAS/store changes.
- No `S0F0j`/`S0F1j` edits.
- No unrelated files staged.

## Verdict

**F.1 STATIC CONTRACT / VALIDATOR — PASSED.** The materializer trigger boundary
is now pinned by a static validator: the materializer stays Desktop-only,
eligibility-gated, writer-bounded (`overwrite:false`, queue-table-only), and free
of Chrome/sync/watcher coupling; the scanner stays enqueue-only; and no trigger
(UI, diagnostics, or library-action wiring) has been added yet.

## Recommended Next Step

Proceed to **F.2**: add the Desktop operator/diagnostic action that invokes
`materializeSavedChatArchiveRequestV1` for a chosen `requestId`, surfaced in the
Archive Health / Diagnostics card (Desktop-gated, no global button, diagnostics
module stays read-only). When F.2 lands, flip the `[F.1-GATE]` health-UI check in
this validator to assert the action is present and correctly bounded, rather than
absent.
