# Folder Sync - Binding Post-Apply Readback Blocked

Verdict: **BINDING POST-APPLY READBACK BLOCKED / PERSISTENCE NOT CONFIRMED**.

This evidence records a live Desktop Studio post-apply readback diagnostic after the binding controlled apply
proof. The controlled apply proof exists and reported success, but the later readback did not confirm durable
canonical binding persistence. This blocks the binding allowed-set flip.

## Proven Inputs

- Binding implementation commit: `d4d5db19`.
- Binding controlled apply proof commit: `5c89ba95`.
- Binding controlled apply evidence reported:
  - `controlledApplyReceipt.status:"applied"`.
  - `controlledApplyReceipt.reason:"binding-repair-applied"`.
  - `canonicalBindingWriteCount:1`.
  - `afterMatchesRequested:true`.
  - `beforeChangedAfterApply:true`.
  - `idempotencyPersisted:true`.
  - `mirrorWriteCount:0`.
  - `tombstoneWriteCount:0`.
  - `consumedOperationCountDelta:null` / not measured.

## Live Readback Output

The later live Desktop Studio readback returned:

```json
{
  "schema": "h2o.studio.folder-sync.binding-post-apply-readback-idempotency.v1",
  "apiLoaded": true,
  "currentBindingHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
  "recomputedBindingHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
  "postApplyMatchesRequested": false,
  "beforeHashNoLongerCurrent": false,
  "consumedLedgerAvailable": true,
  "consumedBindingRepairRowCount": 1,
  "consumedRecordPresent": true,
  "duplicateReplayAttempted": false,
  "duplicateReplayReason": "raw-binding-idempotency-key-not-captured",
  "replayChangedBindingHash": false,
  "applyGatePassed": false,
  "applyTruePassed": false,
  "semanticBindingWriteAttempted": false,
  "bindingMismatchStillBlocked": true,
  "boundaries": {
    "productSyncReady": false,
    "webdavCloudRelay": "blocked",
    "chatSavingWebdavCloudArchiveCas": "blocked"
  }
}
```

The requested/applied hash from the controlled apply proof was:

```text
sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869
```

The readback current hash equals the old before hash:

```text
sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d
```

## Interpretation

Binding live post-apply persistence is **not confirmed**. The consumed ledger record exists, but that only proves
that an operation was recorded; it is not enough to prove the canonical binding state persisted. The current
canonical readback hash equals the old before hash, not the requested/applied hash.

Possible causes to diagnose next:

- The controlled apply wrote transient or in-memory state but not the durable canonical source.
- The snapshot/hash readback source changed or reads a different authority than the apply path.
- A later refresh or reconciliation reverted the binding.
- The selected live candidate was moved back by another process.
- The controlled-apply proof's after snapshot was from a stale or local cache.

## Boundaries

- No new apply/write happened in this diagnostic.
- `duplicateReplayAttempted:false` because the raw binding idempotency key was not captured.
- `applyGatePassed:false`.
- `applyTruePassed:false`.
- `semanticBindingWriteAttempted:false`.
- `binding-mismatch` remains blocked.
- `productSyncReady` remains `false`.
- WebDAV/cloud/relay remains `blocked`.
- Chat Saving WebDAV/cloud/archive CAS remains `blocked`.
- Binding allowed-set flip is blocked.

## Next Step

Next step: read-only binding state-source diagnostic. Do not retry apply, do not proceed to the binding allowed-set
flip, do not flip `productSyncReady`, and do not start WebDAV/cloud/relay.
