# Chat-folder binding sync B1 diagnostics

## Verdict

PARTIAL / B1 COMPLETE. This slice adds read-only chat-folder binding parity diagnostics and a static validator only.

B1 does not implement binding export/import, Chrome binding requests, Desktop binding apply, or binding receipts. It makes the current deferred/partial state explicit so later binding transport work can be measured safely.

## Diagnostic Added

New smoke op:

- `diagnoseChatFolderBindingParity`

Runtime entry points:

- `H2O.Studio.devSmoke.folderSync.run({ op:"diagnoseChatFolderBindingParity" })`
- `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseChatFolderBindingParity --timeout-ms 60000`
- `node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChatFolderBindingParity --timeout-ms 60000`

Implementation files:

- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/smoke/desktop-folder-sync-queue-client.mjs`
- `tools/smoke/chrome-cdp-studio.mjs`

Validator:

- `tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`

## Desktop Diagnostic Behavior

Desktop reads bindings through public store APIs only:

- `H2O.Studio.store.folders.list()` or `getAll()`
- `H2O.Studio.store.folders.listChats(folderId)`
- `H2O.Studio.store.chats.count/list/getAll` for best-effort Unfiled count
- `H2O.Studio.store.folders.listRecentlyDeletedFolders()` for active/restored tombstone binding signals

Desktop reports:

- `totalBindingCount`
- `desktopBindingCount`
- `folderBindingCounts`
- redacted `chatFolderBindings`
- `knownChatCount`
- `unfiledCount` when a chat count API is available
- `missingFolderBindingCount`
- `deletedFolderBindingCount`
- `restoredFolderBindingCount`
- `bindingRecoverySnapshotCount`
- `recentlyDeletedRowsScanned`

Desktop returns `parityComparable:false` and `parityOk:null` in B1 because Chrome does not yet have a canonical Desktop binding mirror to compare against.

## Chrome Diagnostic Behavior

Chrome reads mirror/display state only:

- `chrome.storage.local["h2o:prm:cgx:fldrs:state:data:v1"]`
- localStorage fallback for the same key
- Folder display model row count when available

Chrome reports:

- `totalBindingCount`
- `chromeMirrorBindingCount`
- `chromeVisibleFolderCount`
- `folderBindingCounts`
- redacted `chatFolderBindings`
- `missingFolderBindingCount`
- `chromeCanonicalBindingProjectionAvailable`

Chrome returns `parityComparable:false` and `parityOk:null` when the canonical Desktop binding projection is missing. That is expected in B1 and should be treated as clean diagnostic state, not a product failure.

## Expected Current State

`parityComparable:false`

The active local RC folder transport still defers full chat-folder binding sync. B1 therefore expects warnings such as:

- `chrome-binding-mirror-missing-for-parity`
- `desktop-orphan-binding-scan-unavailable`
- `chrome-canonical-binding-projection-missing`
- `chat-folder-binding-transport-deferred`

## Gaps Found For B2

B2 should add a Desktop canonical binding projection and Desktop-to-Chrome import/display parity. The projection should be independent of old receipt/mirror history and should exclude:

- bindings to active deleted folders,
- bindings to purged/permanently suppressed folders,
- bindings to protected/system folder rows,
- stale chat IDs where the chat row is unavailable.

Until B2 exists, B1 diagnostics cannot make a cross-surface parity judgment and must keep `parityComparable:false`.

## Runtime Proof Status

PASS. The initial runtime blockers were resolved and B1 was proven on both Desktop Studio and Chrome Studio.

Commands run:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseChatFolderBindingParity --timeout-ms 60000
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChatFolderBindingParity --timeout-ms 60000
```

## Desktop Runtime Result

- `op:"diagnoseChatFolderBindingParity"`
- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `surface:"desktop-studio"`
- `adapter:"tauri"`
- `totalBindingCount:12`
- `unfiledCount:29`
- `missingFolderBindingCount:0`
- `deletedFolderBindingCount:0`
- `restoredFolderBindingCount:0`
- `parityComparable:false`
- `parityOk:null`
- `blockers:[]`

Desktop `folderBindingCounts`:

- `f_e301f3506938c19dbac0e304:1`
- `f_2bb1037f88b2719dbac10c22:0`
- `f_d04f98de89e35819e885aef8e:6`
- `f_7050f49d3f341819dba53d547:3`
- `f_3bf15f43b835d19dbac0fb13:2`
- `fold_chrome_chrome-delete-companion-test_mqtdzvyv_4a699cf35f:0`
- `fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd:0`

Desktop warnings:

- `chrome-binding-mirror-missing-for-parity`
- `desktop-orphan-binding-scan-unavailable`

Desktop safety flags:

- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChromeDestructiveBindingApply:true`

## Chrome Runtime Result

- `href:"chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders"`
- `op:"diagnoseChatFolderBindingParity"`
- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `surface:"chrome-studio"`
- `adapter:"mv3"`
- `totalBindingCount:12`
- `unfiledCount:null`
- `missingFolderBindingCount:0`
- `deletedFolderBindingCount:0`
- `restoredFolderBindingCount:0`
- `parityComparable:false`
- `parityOk:null`
- `blockers:[]`

Chrome `folderBindingCounts` included:

- `f_2bb1037f88b2719dbac10c22:1`
- `f_3bf15f43b835d19dbac0fb13:3`
- `f_7050f49d3f341819dba53d547:7`
- `f_e301f3506938c19dbac0e304:1`
- many historic/test/deleted/restored folder IDs at `0`

Chrome warnings:

- `chrome-canonical-binding-projection-missing`
- `chat-folder-binding-transport-deferred`

Chrome safety flags:

- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noHardDelete:true`
- `noPurge:true`
- `noChromeDestructiveBindingApply:true`

## Runtime Interpretation

B1 runtime proof is now green on Desktop and Chrome:

- The diagnostic is read-only and safe.
- Both surfaces report binding summaries.
- Both surfaces return `parityComparable:false` and `parityOk:null` intentionally because canonical binding transport/projection is still deferred.
- The prior `desktop-queue-timeout` and `chrome-cdp-unavailable` blockers are resolved for this proof.
- B2 should focus on Desktop canonical binding export / transport projection before any Chrome mutation/request flows.

## Safety Boundaries

Confirmed by implementation and validator:

- no chat deletion
- no snapshot deletion
- no hard delete
- no purge
- no Chrome destructive binding apply
- no Chrome direct tombstone apply/create
- no folder delete/restore behavior change
- no binding export/import mutation contract added
- no Chrome binding request/apply authority added

## Validation

Passed:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs`
- `node --check tools/smoke/chrome-cdp-studio.mjs`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`

`git diff --cached --check` should be run after staging the B1 files.
