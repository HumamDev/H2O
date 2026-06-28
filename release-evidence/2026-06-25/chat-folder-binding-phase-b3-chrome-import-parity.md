# Chat-folder binding sync B3 Chrome import parity

## Verdict

PASS / B3 CLOSED. Chrome imports and reads the Desktop canonical chat-folder binding projection from `latest.json`, then exposes a read-only parity comparison through `diagnoseChatFolderBindingParity`.

B3 does not fix binding mismatches. It makes them comparable, explicit, and safe.

B3 runtime proof was completed after the B3a diagnostic fix:

- B3 implementation commit: `64a83b1f9321388952864440e0ebffb42dd33dd9`
- B3a diagnostic fix commit: `eafd0ec2dd6452489f690aebf1619b488b5af47d`
- B3a evidence: `release-evidence/2026-06-25/chat-folder-binding-phase-b3a-diagnostic-runtime-fix.md`

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

PASS after B3a. Fresh Studio Launcher assets were rebuilt and Chrome CDP smoke profile was relaunched. The focused B3 diagnostic is now allowlisted, runs, and returns explicit read-only mismatch details.

Chrome health proof before import:

- `status:"healthy"`
- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`
- `blockers:[]`

Chrome import command before B3a runtime diagnostic:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"chat-folder-binding-b3-import-parity"}' --timeout-ms 60000
```

Chrome import result:

- `status:"sync-folder-imported"`
- `blockers:[]`
- warnings were existing deferred propagation warnings, including `library-propagation-chat-folder-bindings-deferred`

B3a root cause and fix:

- Before B3a, the diagnostic threw with `reason:"localBindingRows is not defined"`.
- B3a declared the Chrome diagnostic accumulator and strengthened the validator so the declaration must exist before use.
- After rebuilding Studio Launcher assets, the loaded smoke registry reported `smokeRegistryOverlayStatus:"source-current"`.

Focused diagnostic command after B3a:

```sh
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseChatFolderBindingParity --timeout-ms 60000
```

Focused diagnostic result after B3a:

- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `surface:"chrome-studio"`
- `adapter:"mv3"`
- `canonicalSource:"desktop-canonical-chat-folder-bindings"`
- `totalBindingCount:12`
- `importedDesktopCanonicalBindingCount:12`
- `importedDesktopCanonicalUnfiledCount:29`
- `localBindingCount:0`
- `chromeBindingCount:0`
- `comparisonMode:"chat-folder-map"`
- `comparableBindingCount:12`
- `missingInChromeCount:12`
- `extraInChromeCount:0`
- `folderCountMismatchCount:4`
- `parityComparable:true`
- `parityOk:false`
- `chromeCanonicalBindingProjectionAvailable:true`
- `chromeCanonicalBindingProjectionSchema:"h2o.studio.chat-folder-bindings.desktop-canonical.v1"`
- `blockers:[]`
- `warnings:[]`

Interpretation:

- B3 runtime proof is now closed.
- `parityOk:false` is not a B3 failure. B3 was not scoped to mutate or repair Chrome binding/display state.
- The useful B3 result is that the imported Desktop canonical projection is visible to Chrome diagnostics and the parity gap is now explicit.
- The current mismatch is read-only evidence for B4/B5.
- The B3a evidence file records the runtime asset refresh and crash fix details.

## Remaining For B4

B4 should address Chrome display/read-model parity using the imported Desktop canonical projection, still without Chrome destructive binding authority.

B5 can then address request/receipt design for user-initiated binding moves if mutation is needed.

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
