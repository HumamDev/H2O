# Chat-folder binding sync B2 Desktop export

## Verdict

PARTIAL / B2 IMPLEMENTED. Desktop now exports a read-only canonical chat-folder binding projection into the Desktop-to-Chrome `latest.json` bundle.

B2 does not add Chrome binding mutation, Chrome binding requests, Desktop binding request apply, chat deletion, snapshot deletion, hard delete, purge, or destructive Chrome binding authority.

## Export Schema

New Desktop bundle projection:

- `desktopCanonicalChatFolderBindings`
- `chatFolderBindings`

Schema:

- `h2o.studio.chat-folder-bindings.desktop-canonical.v1`

Each row includes:

- `chatId`
- `conversationId`
- `folderId`
- `folderName`
- `source:"desktop-canonical-chat-folder-bindings"`
- `sourceSurface:"desktop-studio"`
- `authority:"desktop"`
- `status:"active"`
- `observedAt`

The projection is read-only transport state. It is not a binding apply instruction.

## Export Summary

`exportLatestSyncBundle()` now returns:

- `chatFolderBindingExport.schema`
- `chatFolderBindingExport.bindingCount`
- `chatFolderBindingExport.folderBindingCounts`
- `chatFolderBindingExport.unfiledCount`
- `chatFolderBindingExport.missingFolderBindingCount`
- `chatFolderBindingExport.deletedFolderBindingCount`
- `chatFolderBindingExport.restoredFolderBindingCount`
- `chatFolderBindingExport.blockers`
- `chatFolderBindingExport.warnings`

The full bundle summary also includes:

- `desktopCanonicalChatFolderBindingCount`

## Chrome Read-only Awareness

Chrome import now stores the Desktop canonical projection as read-only snapshot metadata under the existing folder-state cache:

- `desktopCanonicalChatFolderBindings`

Chrome B1 diagnostics can detect this projection after a Desktop-to-Chrome import and report:

- `chromeCanonicalBindingProjectionAvailable`
- `chromeCanonicalBindingCount`
- `chromeCanonicalBindingProjectionSchema`

Chrome still returns `parityComparable:false` in B2 because display/import parity is deferred to B3.

## Diagnostic Interpretation

Desktop `diagnoseChatFolderBindingParity` now reports that the Desktop canonical binding export projection is available:

- `desktopCanonicalBindingProjectionAvailable:true`
- `desktopCanonicalBindingProjectionSchema:"h2o.studio.chat-folder-bindings.desktop-canonical.v1"`

Chrome warnings move from "projection missing" toward import-stage state:

- before Desktop-to-Chrome import: `chrome-binding-import-deferred`
- after import: projection should be visible, but parity remains deferred until B3

## Runtime Proof Status

PARTIAL. Static validation passed for B2. Live Desktop queue export proof was attempted, but the Desktop WebView did not process the smoke queue command before timeout.

Command attempted:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"chat-folder-binding-b2-desktop-export"}' --timeout-ms 60000
```

Observed result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `commandPath:"/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"`
- `payloadAccepted:true`
- `mutationAllowed:true`
- `blockers:["desktop-queue-timeout"]`

Required operator recovery:

- Open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`
- Set `localStorage["h2o:studio:smoke-bridge:enabled:v1"] = "folder-sync-rc"`
- Confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`

Expected result after queue recovery:

- `status:"latest-sync-bundle-written"`
- `chatFolderBindingExport.schema:"h2o.studio.chat-folder-bindings.desktop-canonical.v1"`
- `chatFolderBindingExport.bindingCount >= 12`
- `chatFolderBindingExport.blockers:[]`

If Chrome import is run after that, Chrome B1 diagnostic should no longer report that the Desktop canonical binding projection is missing. It may still report `parityComparable:false` until B3 implements Chrome import/display parity over the canonical projection.

## Remaining For B3

B3 should consume the Desktop canonical binding projection for Chrome import/display parity:

- import the canonical projection as the binding comparison source,
- compare Desktop and Chrome folder chat counts,
- reconcile display counts without granting Chrome destructive binding authority,
- keep Chrome mutation/request flows deferred until the later request/receipt slice.

## Safety Boundaries

Confirmed by implementation and validator:

- no chat deletion
- no snapshot deletion
- no hard delete
- no purge
- no Chrome destructive binding apply
- no Chrome direct tombstone apply/create
- no folder delete/restore behavior change
- no Chrome binding request/apply authority

## Validation

Passed:

- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`
- `git diff --check`
- `git diff --cached --check`
