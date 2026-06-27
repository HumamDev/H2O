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

PASS. The Desktop queue blocker was resolved and B2 was proven at runtime.

Desktop queue health before proof:

- `href:"http://127.0.0.1:1430/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders"`
- `queueEnabled:true`
- `queueStarted:true`
- `queueBlockers:[]`
- `queueRegistryBlockers:[]`
- `queueLastStatus:"latest-sync-bundle-written"`
- `bridgeStatus:"healthy"`
- `bridgeBlockers:[]`

Desktop export command:

```sh
node tools/smoke/desktop-folder-sync-queue-client.mjs --op syncNow --allow-mutation --payload-json '{"direction":"desktop-to-chrome","reason":"chat-folder-binding-b2-desktop-export"}' --timeout-ms 60000
```

Desktop `syncNow` export result:

- `op:"syncNow"`
- `direction:"desktop-to-chrome"`
- `status:"latest-sync-bundle-written"`
- `ok:true`
- `transport:"latest.json"`
- `bytes:754321`
- `blockers:[]`
- `warnings:[]`

Direct `latest.json` inspection:

- path: `/Users/hobayda/H2O Studio Sync/latest.json`
- top-level binding keys:
  - `chatFolderBindings`
  - `desktopCanonicalChatFolderBindings`
- projection object exists
- `schema:"h2o.studio.chat-folder-bindings.desktop-canonical.v1"`
- `source:"desktop-canonical-chat-folder-bindings"`
- `status:"exported"`
- `bindingCount:12`
- `unfiledCount:29`
- `missingFolderBindingCount:0`
- `deletedFolderBindingCount:0`
- `restoredFolderBindingCount:0`

Runtime `folderBindingCounts`:

- `f_2bb1037f88b2719dbac0e304:0`
- `f_3bf15f43b835d19dbac0fb13:2`
- `f_7050f49d3f341819dba53d547:3`
- `f_d04f98de89e35819e885aef8e:6`
- `f_e301f3506938c19dbac0e304:1`
- `fold_chrome_chrome-delete-companion-test_mqtdzvyv_4a699cf35f:0`
- `fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd:0`

Binding rows include active Desktop canonical rows with:

- `chatId`
- `conversationId`
- `folderId`
- `folderName`
- `source:"desktop-canonical-chat-folder-bindings"`
- `sourceSurface:"desktop-studio"`
- `authority:"desktop"`
- `status:"active"`
- `state:"active"`
- `noChromeDestructiveBindingApply:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noHardDelete:true`
- `noPurge:true`

Projection diagnostics:

- `diagnostics.exported:true`
- `diagnostics.bindingCount:12`
- `diagnostics.unfiledCount:29`
- `diagnostics.desktopAuthority:true`
- `diagnostics.chromeAuthority:false`
- `diagnostics.readOnlyProjection:true`
- `diagnostics.blockers:[]`
- `diagnostics.warnings:[]`
- `diagnostics.noChromeDestructiveBindingApply:true`
- `diagnostics.noHardDelete:true`
- `diagnostics.noPurge:true`
- `diagnostics.noChatDelete:true`
- `diagnostics.noSnapshotDelete:true`
- `diagnostics.noAssetDelete:true`

Runtime interpretation:

- B2 runtime proof is green.
- Desktop canonical chat-folder binding projection is present in `latest.json`.
- The projection is an object with `bindings` / `rows` arrays, not a raw top-level array.
- The smoke `syncNow` response did not surface a top-level `chatFolderBindingExport` summary, but the transport file contains the canonical projection and diagnostics correctly.
- Treat smoke summary exposure as optional diagnostic polish, not a B2 blocker.
- B3 should focus on Chrome importing/reading this Desktop canonical projection and making parity comparable, still without Chrome destructive binding authority.

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
