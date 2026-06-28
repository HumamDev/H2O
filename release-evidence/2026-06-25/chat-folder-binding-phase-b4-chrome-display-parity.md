# Chat-folder binding sync B4 Chrome display parity

## Verdict

PASS / B4 IMPLEMENTED. Chrome now has a read-only display/read-model path for the imported Desktop canonical chat-folder binding projection.

B4 does not add Chrome binding mutation, Chrome binding request export, Desktop binding request apply, folder delete/restore behavior changes, chat deletion, snapshot deletion, hard delete, purge, or Chrome destructive binding authority.

Chrome display/read-model parity is driven by the imported Desktop canonical projection.

## What Changed

Chrome Library Workspace now normalizes the imported Desktop canonical binding projection into a read-only display model:

- source projection: `desktopCanonicalChatFolderBindings`
- schema: `h2o.studio.chat-folder-bindings.desktop-canonical.v1`
- display source: `desktop-canonical-chat-folder-bindings`
- authority: Desktop
- Chrome authority: false

The read/display model exposes:

- `chatFolderBindingDisplayProjectionAvailable`
- `chatFolderBindingDisplayProjectionSource`
- `chatFolderBindingDisplayProjectionSchema`
- `chatFolderBindingDisplayBindingCount`
- `chatFolderBindingDisplayFolderBindingCounts`
- `chatFolderBindingDisplayRows`
- `chatFolderBindingDisplayItems`
- `chatFolderBindingDisplayUnfiledCount`

Chrome `diagnoseChatFolderBindingParity` now compares the imported Desktop canonical rows against the Chrome display/read projection when available. Local mirror binding counts are still reported separately for diagnostics, but they no longer define display parity once the Desktop canonical projection is present.

## Expected Imported Projection

B2 runtime proved Desktop exports:

- `bindingCount:12`
- `unfiledCount:29`
- `missingFolderBindingCount:0`
- `deletedFolderBindingCount:0`
- `restoredFolderBindingCount:0`

Expected folder counts from the Desktop canonical projection:

- `f_3bf15f43b835d19dbac0fb13:2`
- `f_7050f49d3f341819dba53d547:3`
- `f_d04f98de89e35819e885aef8e:6`
- `f_e301f3506938c19dbac0e304:1`
- zero-count folders may remain present in exported summary diagnostics where available

## Runtime Proof

Runtime proof status: PASS for the B4 display/read-model diagnostic.

Chrome CDP was relaunched against the rebuilt Studio Launcher extension. The smoke registry overlay reported `source-current`.

Chrome sync folder health in this smoke profile still needs an operator permission regrant for a fresh filesystem import:

- `connected:true`
- `permission:"prompt"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`
- `blockers:["permission-required"]`

That permission prompt blocks a fresh `desktop-to-chrome` import in this CDP profile, but the imported Desktop canonical binding projection already cached from B3/B2 was available. The B4 diagnostic proved the Chrome display/read model now uses that imported projection.

`diagnoseChatFolderBindingParity` returned:

- `ok:true`
- `status:"chat-folder-binding-parity-diagnosed"`
- `importedDesktopCanonicalBindingCount:12`
- `importedDesktopCanonicalUnfiledCount:29`
- `chromeReadDisplayProjectionAvailable:true`
- `chromeReadDisplayProjectionSource:"desktop-canonical-chat-folder-bindings"`
- `chromeReadDisplayProjectionSchema:"h2o.studio.chat-folder-bindings.desktop-canonical.v1"`
- `chromeDisplayBindingCount:12`
- `chromeBindingCount:12`
- `chromeCanonicalBindingCount:12`
- `parityComparable:true`
- `parityOk:true`
- `comparisonMode:"chat-folder-map"`
- `missingInChromeCount:0`
- `extraInChromeCount:0`
- `folderCountMismatchCount:0`
- `blockers:[]`
- `warnings:[]`

The diagnostic also preserved the local mirror state separately:

- `localBindingCount:0`
- `chromeMirrorBindingCount:0`

This confirms B4 changes display/read parity without mutating Chrome binding storage.

## Validation

Validation passed:

- `node --check src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b4-chrome-display-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b4-chrome-display-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`

Pending final commit gate:

- `git diff --check`
- `git diff --cached --check`

## Safety Boundaries

Confirmed by implementation and validator:

- read-only projection
- no Chrome destructive binding apply
- no Chrome direct folder binding mutation
- no Chrome binding request export
- no Desktop binding request apply
- no chat deletion
- no snapshot deletion
- no hard delete
- no purge
- no asset deletion
- no folder delete/restore behavior change

## Remaining For B5/B6

B5 should design request/receipt behavior for user-initiated Chrome binding moves if Chrome mutation UX is needed.

B6 should prove folder delete binding fallback and folder restore rebind behavior against the canonical projection once the read/display model is green.
