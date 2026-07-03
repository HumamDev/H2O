# Folder Sync - Binding Repair Controlled Apply Proof

Status: BINDING CONTROLLED APPLY PASSED.

This evidence records a manual live Desktop Studio WebView DevTools controlled apply of the chat↔folder
binding repair handler, run after a candidate-safe dry-run scan selected an accepted dry-run candidate. It was
a live canonical binding write (`canonicalBindingWriteCount:1`), NOT an F11/S5 allowed-set flip. It proves live
controlled apply only; it does NOT unblock `binding-mismatch`, does NOT flip `productSyncReady`, and does NOT
touch WebDAV/cloud/relay/archive CAS or Chat Saving. All identifiers are redacted/hash-only; no raw chat,
folder, request, review, or idempotency-key values are reproduced here.

## References

- Binding-mismatch repair implementation: `d4d5db19`.
- Binding live dry-run proof: `d139e062`.

## Live Desktop Output (redacted / hash-only)

The controlled apply was run manually in Desktop Studio WebView DevTools. A candidate-safe dry-run scan first
found an accepted dry-run candidate; the dry-run guard passed (zero canonical binding writes) BEFORE
`apply:true` was used with the binding apply gate `folder-sync-chat-folder-binding-repair-apply`.

```json
{
  "schema": "h2o.studio.folder-sync.binding-controlled-apply-candidate-safe.v1",
  "phase": "binding-controlled-apply-after-dry-run-candidate-scan",
  "status": "passed",
  "apiLoaded": true,
  "requestSchemaPresent": true,
  "applyTruePassed": true,
  "applyGatePassed": true,
  "applyGate": "folder-sync-chat-folder-binding-repair-apply",
  "selectedCandidate": {
    "validation": { "ok": true, "blockers": [] },
    "dryRun": { "status": "dry-run", "reason": "dry-run-binding-repair-plan-ready", "dryRun": true },
    "canonicalBindingWriteCount": 0,
    "idempotencyPersisted": false,
    "unchangedAfterDryRun": true
  },
  "dryRunPrecheck": {
    "schema": "h2o.studio.chat-folder-binding-receipt.v1",
    "status": "dry-run",
    "reason": "dry-run-binding-repair-plan-ready",
    "resultingBindingHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
    "canonicalBindingWriteCount": 0,
    "canonicalWriteCount": 0,
    "idempotencyPersisted": false,
    "dryRun": true,
    "appliedAt": null,
    "productSyncReady": false,
    "bindingMismatchAllowed": false,
    "noDestructiveMutation": true,
    "noMirrorWrite": true,
    "noTransportWrite": true,
    "noWebdavWrite": true
  },
  "controlledApplyReceipt": {
    "schema": "h2o.studio.chat-folder-binding-receipt.v1",
    "status": "applied",
    "reason": "binding-repair-applied",
    "resultingBindingHash": "sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869",
    "canonicalBindingWriteCount": 1,
    "canonicalWriteCount": 1,
    "idempotencyPersisted": true,
    "dryRun": false,
    "appliedAt": "2026-07-03T11:22:54.324Z",
    "productSyncReady": false,
    "bindingMismatchAllowed": false,
    "noDestructiveMutation": true,
    "noMirrorWrite": true,
    "noTransportWrite": true,
    "noWebdavWrite": true
  },
  "hashes": {
    "beforeBindingHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
    "requestedBindingHash": "sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869",
    "afterBindingHash": "sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869",
    "afterMatchesRequested": true,
    "beforeChangedAfterApply": true
  },
  "counts": {
    "canonicalBindingWriteCount": 1,
    "mirrorWriteCount": 0,
    "tombstoneWriteCount": 0,
    "consumedOperationCountDelta": null
  },
  "idempotencyPersisted": true,
  "safety": {
    "noHardDelete": true,
    "noPurge": true,
    "noChatDelete": true,
    "noFolderDelete": true,
    "noBindingDeleteBeyondRequestedUnbind": true,
    "noTombstoneMutation": true,
    "noMirrorWrite": true,
    "noTransportWrite": true,
    "noWebdavWrite": true
  },
  "bindingMismatchStillBlocked": true,
  "boundaries": {
    "productSyncReady": false,
    "webdavCloudRelay": "blocked",
    "chatSavingWebdavCloudArchiveCas": "blocked"
  }
}
```

## What This Proves

- **Candidate-safe scan found an accepted dry-run candidate** (`selectedCandidate.validation.ok:true`,
  `selectedCandidate.dryRun.status:"dry-run"`, `unchangedAfterDryRun:true`).
- **Dry-run guard passed before apply**: the dry-run precheck emitted `status:"dry-run"`,
  `canonicalBindingWriteCount:0`, `canonicalWriteCount:0`, `appliedAt:null` — zero canonical binding writes
  before `apply:true`.
- **Controlled apply used the gate** `folder-sync-chat-folder-binding-repair-apply` and `apply:true`
  (`applyGatePassed:true`, `applyTruePassed:true`).
- **Controlled apply returned `status:"applied"`** with `reason:"binding-repair-applied"`.
- **`canonicalBindingWriteCount` was 1** (a single canonical binding write).
- **`afterBindingHash` matched `requestedBindingHash`** (`afterMatchesRequested:true`) and
  **`beforeBindingHash` changed after apply** (`beforeChangedAfterApply:true`).
- **`idempotencyPersisted` was true** (reported by the controlled apply receipt).
- **`mirrorWriteCount` was 0** and **`tombstoneWriteCount` was 0**.
- **`consumedOperationCountDelta` was `null`** — the live ledger delta was NOT measured; this evidence does NOT
  claim a measured ledger delta.
- **No destructive mutation flags were true** (`noHardDelete`, `noPurge`, `noChatDelete`, `noFolderDelete`,
  `noBindingDeleteBeyondRequestedUnbind`, `noTombstoneMutation`, `noMirrorWrite`, `noTransportWrite`,
  `noWebdavWrite`).

## Boundaries

- `bindingMismatchStillBlocked:true` — `binding-mismatch` remains BLOCKED until a later, separately-approved
  allowed-set flip; this evidence proves live controlled apply, NOT an F11/S5 allowed-set flip.
- `productSyncReady` remains `false`.
- WebDAV / cloud / relay remains `blocked`.
- Chat Saving WebDAV/cloud/archive CAS remains `blocked`.
- No `fullBundle.v3`; no mirror/transport/WebDAV write in this apply.
- Desktop remains canonical; hard delete blocked; folder delete preserves chats; the S2b sortOrder-preserving
  mirror marker remains intact in source.

## Verdict

BINDING CONTROLLED APPLY PASSED. The binding repair handler passed a live controlled apply after a
candidate-safe dry-run scan: dry-run guard first (0 canonical binding writes), then a gated `apply:true`
producing `status:"applied"`, `canonicalBindingWriteCount:1`, `afterMatchesRequested:true`,
`beforeChangedAfterApply:true`, `idempotencyPersisted:true`, `mirrorWriteCount:0`, `tombstoneWriteCount:0`. No
destructive mutation, no mirror/transport/WebDAV write. `binding-mismatch` stays blocked, `productSyncReady`
stays `false`, WebDAV/cloud/relay + Chat Saving CAS stay blocked. This is NOT an allowed-set flip.

## Recommended Next Slice

A binding post-apply readback / idempotency proof (read-only: confirm the canonical binding readback matches
`afterBindingHash` and that a duplicate replay is a 0-write no-op) — OR, if the readback proof is deemed
sufficient, a binding allowed-set preflight (design-only gate) as the step BEFORE any F11/S5 binding allowed-set
flip. NOT `productSyncReady`, NOT WebDAV/cloud/relay/`fullBundle.v3`, NOT Chat Saving CAS. Keep
`binding-mismatch` blocked, `productSyncReady` false, and Chat Saving CAS blocked until that later,
separately-approved slice.
