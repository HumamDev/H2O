# Phase 6A Closeout - Desktop Recently Deleted permanent delete

## Verdict

Phase 6A is closed for local RC.

Desktop-only Recently Deleted permanent delete is implemented and runtime-proven. The workflow now handles both active deleted folder tombstones and restored/history tombstone rows without adding Chrome purge authority or expanding destructive behavior.

## Completed Chain

- `717765b8767feca1f77eefa1bd040adf0a19d28b` - 6A.1 purge API
- `a53487b44e1383707e05e84814b288107318c0f2` - 6A.1b prevent purged folders from reappearing
- `d238b513304dfe802228700e27b17229be3ceaf5` - 6A.1c resurrection repair
- `256aab9a74dbce0deb031ca69de0f81e9356805b` - 6A.1c runtime proof
- `f9b4ddb3a9a766bf835fafd4a1f2129c7494afdd` - 6A.2 purge UI
- `894ddf60f5dd011c30570881ee195c72f018b585` - 6A.2b layout polish
- `8a30e3dd00ef7c10ac63f7ac01939f12f323cb99` - 6A.2c premium Recently Deleted layout
- `9f4d2f1fd6f30b0cd7d4bef224763bc6fef99cd8` - 6A.2 visual QA closeout
- `dc7d4dfe2421d0c4fd85965b8ab6bf48639cda97` - 6A.3 workflow closeout
- `bf3287ee4a2cf04db0d78caa29e092a4574e6806` - 6A.4 clear restored history
- `8fd69afb4bddf1dcad94ad3d1b7ee494e530313f` - 6A.4 runtime proof
- `5c887d8bc85e0711bc0fd72e39e390c03bbb4630` - 6A.5 purge UI confirmation fix
- `66dd952f3056a309c88389312a730249633710f9` - 6A.5b purge button wiring fix
- `8af37c259de6cb0ca2b6d0b6bc3e6cee3c7b3f8c` - 6A.5c final purge button execution fix
- `b94a3b7622126177feb8267b4662f2651409d912` - 6A.5c runtime proof

## Closed Behavior

`Delete permanently` handles active deleted folder tombstones from the Desktop Recently Deleted panel.

`Clear restored history` handles restored/history tombstone rows separately.

Purged folder rows are permanently suppressed and do not reappear in the normal Desktop folder list.

The UI remains Desktop-only. Chrome does not receive purge UI, purge authority, delete authority, or restore authority.

## Final Live UI Proof

Manual Desktop UI sequence:

1. User created a test folder.
2. User deleted the test folder.
3. Recently Deleted showed an active purge-eligible row and `Delete permanently (1)`.
4. User clicked `Delete permanently (1)`.
5. User accepted the native confirmation.
6. Desktop DevTools verification showed:

```json
{
  "recentlyDeletedOk": true,
  "recentlyDeletedTotal": 0,
  "purgeEligibleCount": 0,
  "restoredHistoryClearableCount": 0,
  "testRowsVisible": 0,
  "blockers": []
}
```

Result: the live UI button completed the purge flow and the test folder did not reappear in the normal folder list.

## Restored-History Clear Proof

Prior Phase 6A.4 runtime proof cleared restored/history rows:

- `clearedCount:11`
- after Recently Deleted total: `0`
- normal folder suspect rows: `0`

The restored/history clear path is separate from active deleted folder purge and does not overload `Delete permanently`.

## Safety Invariants

- no Chrome purge UI
- no Chrome delete authority
- no Chrome restore authority
- no Chrome purge authority
- no chat deletion
- no snapshot deletion
- no asset deletion
- no hard folder-row deletion
- no receipt deletion

## Known Caveat

Desktop smoke queue timeout remains documented separately as a runtime/gate-state issue. It is not a product purge failure and did not block the live Desktop UI proof.

## Deferred Scope

- WebDAV/cloud/relay
- public signing/notarization
- broader metadata sync
- full chat-folder binding sync

## Recommendation

Treat Desktop Recently Deleted permanent delete as local-RC closed. Next work should stay separate from purge unless it is explicit release evidence, packaged validation, or a new scoped design phase.
