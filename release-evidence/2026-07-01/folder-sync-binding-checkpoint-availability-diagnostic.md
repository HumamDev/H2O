# Folder Sync - Binding Checkpoint-Availability Diagnostic

Status: CHECKPOINT AVAILABILITY CONFIRMED — WAL MODE, INSPECTABLE CHECKPOINT ROWS (via select).

This evidence records a manual live read-only Desktop Studio WebView DevTools checkpoint-availability
diagnostic, run after the independent review of the durable-gate commit `71616328` to learn how the real
Desktop Tauri SQL plugin reports `PRAGMA wal_checkpoint(TRUNCATE)` BEFORE patching the fence. It is diagnostic
/ fence only: it did NOT call `H2O.Studio.sync.bindingRepair.apply`, did NOT pass the binding apply gate, did
NOT use `apply:true`, and wrote NO folder/chat/binding rows (only PRAGMAs). `wal_checkpoint(TRUNCATE)` is a
SQLite maintenance/fence op; it does not mutate user folder/chat data.

## Live Desktop Output (read-only; no user data)

```json
{
  "schema": "h2o.studio.folder-sync.binding-checkpoint-availability-diagnostic.v1",
  "phase": "binding-checkpoint-availability-diagnostic",
  "diagnosticOnly": true,
  "calledBindingApply": false,
  "applyGatePassed": false,
  "applyTruePassed": false,
  "invokePath": "__TAURI_INTERNALS__.invoke",
  "db": "sqlite:studio-v1.db",
  "journalMode": { "ok": true, "present": true, "value": "wal", "rawKeys": ["journal_mode"] },
  "checkpointSelect": {
    "ok": true,
    "present": true,
    "rawShape": "object",
    "rawKeys": ["busy", "log", "checkpointed"],
    "busy": 0,
    "log": 0,
    "checkpointed": 0
  },
  "checkpointExecute": {
    "ok": true,
    "rawShape": "array[2]",
    "exposesCheckpointColumns": false
  },
  "recommendedFenceInterpretation": "checkpoint-confirmed",
  "boundaries": {
    "bindingMismatchStillBlocked": true,
    "productSyncReady": false,
    "webdavCloudRelay": "blocked",
    "chatSavingWebdavCloudArchiveCas": "blocked"
  },
  "privacy": { "rawChatIdsLogged": false, "rawFolderIdsLogged": false, "rawContentLogged": false }
}
```

## What This Confirms

- **WAL mode:** `journalMode.value:"wal"`.
- **The `select` path is usable and exposes the checkpoint columns:** `checkpointSelect.ok:true`,
  `rawShape:"object"`, `rawKeys:["busy","log","checkpointed"]`, with `busy:0`, `log:0`, `checkpointed:0`
  (`recommendedFenceInterpretation:"checkpoint-confirmed"`).
- **The `execute` path is NOT sufficient:** `checkpointExecute.rawShape:"array[2]"`,
  `exposesCheckpointColumns:false` — it returns execute-metadata (rowsAffected/lastInsertId), NOT the
  checkpoint columns, so a non-throwing execute cannot confirm durability.
- **Therefore the durable gate must become busy-aware:** parse the `select` checkpoint row; `busy===0` (or
  non-WAL) is durable; `busy===1` is incomplete → unverifiable; execute-only is unverifiable.
- **No apply / gate / write occurred**; live apply remains blocked.

## Boundaries

- `binding-mismatch` remains BLOCKED; `productSyncReady` remains `false`; WebDAV/cloud/relay remains blocked;
  Chat Saving WebDAV/cloud/archive CAS remains blocked.
- No product source change is part of this diagnostic evidence; the busy-aware fence fix is recorded
  separately.

## Verdict

CHECKPOINT AVAILABILITY CONFIRMED. WAL mode; the `select` path exposes an inspectable
`(busy, log, checkpointed)` checkpoint row (`busy:0` = checkpoint-confirmed); the `execute` path exposes no
checkpoint columns and must not be used as durable proof. This directly motivates the busy-aware fence fix.
