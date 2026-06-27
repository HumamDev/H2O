# Chat-folder binding sync B3 Chrome import parity

## Verdict

PARTIAL / B3 IMPLEMENTED. Chrome now imports and reads the Desktop canonical chat-folder binding projection from `latest.json`, then exposes a read-only parity comparison through `diagnoseChatFolderBindingParity`.

B3 does not fix binding mismatches. It makes them comparable, explicit, and safe.

## Imported Projection

Desktop B2 exports:

- `desktopCanonicalChatFolderBindings`
- `chatFolderBindings`

Chrome B3 reads and caches the Desktop projection as read-only state:

- schema: `h2o.studio.chat-folder-bindings.desktop-canonical.v1`
- source: `desktop-canonical-chat-folder-bindings`
- authority: Desktop
- Chrome authority: false

Chrome import/sync output includes:

- `desktopCanonicalChatFolderBindingImport`
- `importedDesktopCanonicalBindingCount`

## Diagnostic Fields

Chrome `diagnoseChatFolderBindingParity` now reports:

- `importedDesktopCanonicalBindingCount`
- `importedDesktopCanonicalFolderBindingCounts`
- `importedDesktopCanonicalUnfiledCount`
- `localBindingCount`
- `chromeBindingCount`
- `localFolderBindingCounts`
- `chromeFolderBindingCounts`
- `comparisonMode`
- `comparableBindingCount`
- `missingInChromeCount`
- `extraInChromeCount`
- `folderCountMismatchCount`
- `missingInChrome`
- `extraInChrome`
- `folderCountMismatches`
- `parityComparable`
- `parityOk`

If exact chat IDs are available on both sides, B3 compares `chatId -> folderId` mappings with `comparisonMode:"chat-folder-map"`.

If exact row comparison cannot be trusted, the diagnostic can fall back to `comparisonMode:"folder-counts-only"`.

If the Desktop projection is absent, Chrome still returns a clean non-comparable state:

- `parityComparable:false`
- `parityOk:null`
- warning: `chrome-binding-import-deferred`
- warning: `desktop-canonical-binding-projection-not-imported`

## Expected Runtime Interpretation

B2 proved the Desktop projection contains:

- `bindingCount:12`
- `unfiledCount:29`
- `missingFolderBindingCount:0`
- `deletedFolderBindingCount:0`
- `restoredFolderBindingCount:0`

B1 runtime showed Chrome had a different local mirror distribution than Desktop. B3 should therefore make parity comparable and may return `parityOk:false` until later phases reconcile the binding source:

- Desktop B1 examples: Study `3`, Tech `2`, Code `1`, Health `6`
- Chrome B1 examples: Study `7`, Tech `3`, Code `1`, English `1`

That mismatch is acceptable for B3. The B3 requirement is explicit, read-only mismatch attribution.

## Runtime Proof Status

PARTIAL. Static validation passed. Chrome CDP was available and connected to the sync folder, but the attached Chrome runtime assets were stale for the focused B3 diagnostic op.

Chrome health proof:

- `status:"healthy"`
- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`
- `blockers:[]`

Chrome import command:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"chat-folder-binding-b3-import-parity"}' --timeout-ms 60000
```

Chrome import result:

- `status:"sync-folder-imported"`
- `blockers:[]`
- warnings were existing deferred propagation warnings, including `library-propagation-chat-folder-bindings-deferred`

Focused diagnostic command:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChatFolderBindingParity --timeout-ms 60000
```

Observed diagnostic blocker:

- `status:"op-not-allowlisted"`
- `blockers:["op-not-allowlisted"]`
- runtime registry allowlist did not include `diagnoseChatFolderBindingParity`

Interpretation:

- This is a Chrome runtime asset freshness blocker for the proof, not a B3 source contract failure.
- Source validation proves `diagnoseChatFolderBindingParity` is registered and the B3 comparison fields exist.
- A fresh Studio Launcher rebuild/reload should be run before collecting B3 runtime diagnostic evidence.

Expected diagnostic assertions after runtime asset refresh:

- `importedDesktopCanonicalBindingCount:12`
- `parityComparable:true` when the imported projection is available
- `parityOk:true` or `parityOk:false`
- if `parityOk:false`, mismatch details are explicit via `missingInChromeCount`, `extraInChromeCount`, and `folderCountMismatchCount`
- `blockers:[]`

## Remaining For B4

B4 should decide the first reconciliation/display parity slice:

- Chrome display/count parity using the Desktop canonical projection, or
- Chrome request/receipt design for user-initiated binding moves.

Do not add Chrome destructive binding authority in B4. Keep Chrome request-only where mutation is needed.

## Safety Boundaries

Confirmed by implementation and validator:

- no chat deletion
- no snapshot deletion
- no hard delete
- no purge
- no asset deletion
- no Chrome destructive binding apply
- no Chrome direct folder binding mutation
- no Chrome tombstone apply/create
- no folder delete/restore behavior change

## Validation

Passed:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check`
