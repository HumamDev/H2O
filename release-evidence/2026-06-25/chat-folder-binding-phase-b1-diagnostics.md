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

Runtime proof was attempted and blocked by local runtime availability, not by the B1 diagnostic allowlist.

Commands run:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseChatFolderBindingParity --timeout-ms 8000
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChatFolderBindingParity --timeout-ms 8000
```

Desktop runtime result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `op:"diagnoseChatFolderBindingParity"`
- `readOnly:true`
- `allowedReadOnlyOps` included `diagnoseChatFolderBindingParity`
- blocker: `desktop-queue-timeout`
- next action from helper: open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`, set localStorage opt-in, and confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`.

Chrome runtime result:

- `ok:false`
- `status:"chrome-cdp-unavailable"`
- `op:"diagnoseChatFolderBindingParity"`
- `readOnly:true`
- `allowedReadOnlyOps` included `diagnoseChatFolderBindingParity`
- blocker: `chrome-cdp-unavailable`
- error: `chrome-cdp-unavailable: fetch failed` on port `9247`

Expected live result once runtime gates are active:

- Desktop should report `status:"chat-folder-binding-parity-diagnosed"` from Desktop store reads.
- Chrome should report `status:"chat-folder-binding-parity-diagnosed"` from Chrome mirror/display reads.

Acceptable B1 result:

- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `parityComparable:false`
- `parityOk:null`
- warnings explaining missing canonical binding transport/mirror data
- `blockers:[]` unless the bridge/runtime itself is unavailable

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
