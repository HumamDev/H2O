# Folder Sync - Binding State-Source Diagnostic

Status: BINDING STATE-SOURCE DIAGNOSTIC CONFIRMS CANONICAL PERSISTENCE BLOCKER.

This evidence records a manual live read-only Desktop Studio WebView DevTools state-source diagnostic run after
the binding controlled-apply proof (`5c89ba95`) and the binding readback persistence block (`d46f0805`). It is
read-only: no `apply:true`, no gate, no canonical write. It confirms that the binding controlled apply's
canonical persistence is NOT confirmed: the snapshot, the store API, and direct SQLite ALL currently agree on
the OLD before-hash, while the consumed-operation ledger nonetheless contains a binding-repair consumed row.
All identifiers are redacted/hash-only; no raw chat, folder, request, review, or idempotency-key values are
reproduced here (function/table names are code identifiers, not user data).

## References

- Binding-mismatch repair implementation: `d4d5db19`.
- Binding controlled apply proof: `5c89ba95`.
- Binding readback persistence block: `d46f0805`.

## Live Desktop Output (read-only; redacted / hash-only)

```json
{
  "schema": "h2o.studio.folder-sync.binding-state-source-diagnostic.v1",
  "readOnly": true,
  "calledApply": false,
  "applyGatePassed": false,
  "applyTruePassed": false,
  "apiLoaded": true,
  "snapshotHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
  "recomputedSnapshotHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
  "storeHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
  "directSqlHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
  "mirrorHash": "sha256:9a451210df6900b3f59f38cee47e5c46afd2d6dc3138efa06d974b76d676452e",
  "expectedBeforeHash": "sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d",
  "expectedRequestedHash": "sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869",
  "snapshotMatchesStore": true,
  "snapshotMatchesDirectSql": true,
  "storeMatchesDirectSql": true,
  "mirrorMatchesSnapshot": false,
  "currentEqualsOldBeforeHash": true,
  "currentEqualsRequestedAppliedHash": false,
  "recomputedSnapshotMatchesSnapshot": true,
  "snapshotRows": 14,
  "storeRows": 14,
  "directSqlRows": 14,
  "mirrorRows": 5,
  "consumedBindingRepairRows": 1,
  "storeIdentity": {
    "adapter": "store.folders.tauri",
    "dbUrl": "sqlite:studio-v1.db",
    "tableName": "folder_bindings",
    "readerFunction": "listCanonicalChatFolderBindings",
    "writerFunction": "moveCanonicalChatFolderBinding",
    "countSource": "sqlite:folder_bindings",
    "storeReady": true,
    "writesSinceBoot": 39,
    "lastWriteAtPresent": true,
    "lastReloadedAtPresent": true,
    "sqliteStatus": { "backend": "sqlite", "ready": true }
  },
  "consumedLedgerSample": {
    "operationKind": "chat-folder-binding-repair",
    "consumedStatus": "consumed",
    "reason": "chat-folder-binding-repair-applied",
    "dedupeKeyPresent": true,
    "eventDigestPresent": true
  },
  "boundaries": {
    "bindingMismatchStillBlocked": true,
    "productSyncReady": false,
    "webdavCloudRelay": "blocked",
    "chatSavingWebdavCloudArchiveCas": "blocked"
  }
}
```

## What This (Read-Only) Confirms

- **Snapshot, store API, and direct SQLite ALL agree on the OLD before-hash.** `snapshotHash`,
  `recomputedSnapshotHash`, `storeHash`, and `directSqlHash` are ALL
  `sha256:1d602101…` = `expectedBeforeHash` (`snapshotMatchesStore:true`, `snapshotMatchesDirectSql:true`,
  `storeMatchesDirectSql:true`, `recomputedSnapshotMatchesSnapshot:true`), with `snapshotRows:14`,
  `storeRows:14`, `directSqlRows:14` all agreeing.
- **Current canonical state does NOT equal the requested/applied hash** from the controlled-apply proof:
  `currentEqualsOldBeforeHash:true` and `currentEqualsRequestedAppliedHash:false` (the applied target was
  `expectedRequestedHash` `sha256:d532446…`). The `status:"applied"` receipt recorded in `5c89ba95` is NOT
  reflected in canonical SQLite.
- **The mirror also differs**, but this is NOT merely a mirror issue: `mirrorMatchesSnapshot:false`
  (`mirrorHash` `sha256:9a45121…`, `mirrorRows:5`) — yet the deeper problem is that DIRECT SQLITE itself is
  still old. A mirror-only reprojection cannot fix a canonical store that never advanced.
- **A consumed-ledger row exists but does not prove canonical persistence.** `consumedBindingRepairRows:1`
  with `operationKind:"chat-folder-binding-repair"`, `consumedStatus:"consumed"`,
  `reason:"chat-folder-binding-repair-applied"` (dedupeKey/eventDigest present, hash-only). The
  consumed-operation ledger recorded the operation as consumed, but the canonical `folder_bindings` table did
  not advance — so the ledger row ALONE does not prove canonical persistence.
- **Store identity resolved** to the real Desktop SQLite binding substrate: `adapter: store.folders.tauri`,
  `dbUrl: sqlite:studio-v1.db`, `tableName: folder_bindings`, `readerFunction:
  listCanonicalChatFolderBindings`, `writerFunction: moveCanonicalChatFolderBinding`, `countSource:
  sqlite:folder_bindings`, `storeReady:true`, `writesSinceBoot:39`, `sqliteStatus.backend: sqlite`,
  `sqliteStatus.ready:true` — so the diagnostic read the correct canonical source, not a stale facade.
- **No apply/gate/write occurred in this diagnostic**: `readOnly:true`, `calledApply:false`,
  `applyGatePassed:false`, `applyTruePassed:false`.

## Boundaries

- `bindingMismatchStillBlocked:true` — `binding-mismatch` remains BLOCKED.
- `productSyncReady` remains `false`.
- WebDAV / cloud / relay remains `blocked`.
- Chat Saving WebDAV/cloud/archive CAS remains `blocked`.
- No product source change is part of this diagnostic slice.

## Verdict

BINDING STATE-SOURCE DIAGNOSTIC CONFIRMS CANONICAL PERSISTENCE BLOCKER. Binding controlled-apply persistence is
NOT confirmed: snapshot, store API, and direct SQLite all read the OLD before-hash (`sha256:1d602101…`), the
current canonical state does NOT equal the requested/applied hash (`sha256:d532446…`), the mirror also differs
(but direct SQLite being old rules out a mirror-only cause), and a consumed-ledger binding-repair row exists
without a corresponding canonical advance. No apply, no gate, no write. `binding-mismatch` stays blocked,
`productSyncReady` stays `false`, WebDAV/cloud/relay + Chat Saving CAS stay blocked.

## Recommended Next Slice

A source-level binding persistence review / fix plan — NOT another blind apply retry, and NOT a binding
allowed-set flip. The review should determine why `moveCanonicalChatFolderBinding` recorded a consumed-operation
ledger row and returned an `applied` receipt while the canonical `folder_bindings` table (read via
`listCanonicalChatFolderBindings` / direct SQLite) did not advance to the requested hash — e.g., a write that
targets a different row/transaction than the reader, an uncommitted/rolled-back transaction, a ledger-record
step ordered before/independent of the canonical write, or a hash computed over a projection that diverges from
the persisted rows. Keep `binding-mismatch` blocked, `productSyncReady` false, and Chat Saving CAS blocked
until the persistence defect is understood and a fix is separately approved.
