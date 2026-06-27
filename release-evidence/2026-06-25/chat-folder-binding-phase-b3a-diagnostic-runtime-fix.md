# Chat-Folder Binding Sync B3a Diagnostic Runtime Fix

Date: 2026-06-27

## Verdict

PASS. B3a fixes the Chrome chat-folder binding parity diagnostic runtime throw.

This is a diagnostic-only fix. It does not add Chrome binding mutation, Chrome binding request flow, Desktop binding request apply, folder delete/restore behavior changes, chat deletion, snapshot deletion, hard delete, purge, or Chrome destructive binding authority.

## Root Cause

B3 added Chrome-side comparison of imported Desktop canonical binding rows against Chrome local binding rows. The diagnostic loop pushed rows into `localBindingRows`, but the Chrome diagnostic function did not declare that accumulator before use.

Runtime failure before B3a:

- `op:"diagnoseChatFolderBindingParity"`
- `ok:false`
- `status:"op-threw"`
- `blockers:["op-threw"]`
- `reason:"localBindingRows is not defined"`

## Fix

B3a declares `localBindingRows` in the Chrome diagnostic accumulator scope before the folder-item loop and strengthens the B3 validator to assert that the declaration exists before the push site.

Changed source:

- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`

## Validation

Static validation passed:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `git diff --check`

The B3 validator now checks that `localBindingRows` is declared before it is populated in `diagnoseChromeChatFolderBindingParity`.

## Runtime Proof

The first post-source-fix runtime attempt still hit the old in-page Chrome bundle and reproduced the pre-fix throw. After rebuilding Studio Launcher assets and relaunching the same Chrome CDP smoke profile, the loaded extension reported:

- `smokeRegistryOverlayStatus:"source-current"`
- `smokeRegistrySourceHash:"0da24d2fab562cab7274298842e4972def4b56382b81f50f7d67b4ba90eaf97f"`
- `smokeRegistryAfterHash:"0da24d2fab562cab7274298842e4972def4b56382b81f50f7d67b4ba90eaf97f"`

Chrome diagnostic result after B3a:

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

Explicit mismatch details were present:

- `missingInChrome` contained redacted chat/folder binding entries.
- `extraInChrome:[]`
- `folderCountMismatches` contained four Desktop canonical folder IDs where Chrome local counts were zero.

This is the expected B3/B3a result: parity is now comparable and safely reports the existing mismatch. Fixing the mismatch is a later binding transport/display parity slice, not B3a.

## Runtime Notes

The Chrome relaunch preserved the same smoke user-data-dir but File System Access permission returned to `prompt`. That prevented a fresh desktop-to-chrome import after relaunch without operator folder regrant. The diagnostic still used the previously imported Desktop canonical projection and proved the B3a runtime crash was fixed.

The pre-relaunch desktop-to-chrome import had already succeeded:

- `ok:true`
- `status:"sync-folder-imported"`
- `direction:"desktop-to-chrome"`
- `blockers:[]`

## Safety Boundaries

- `noChromeDestructiveBindingApply:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noHardDelete:true`
- `noPurge:true`
- no Chrome binding mutation
- no Chrome binding request flow
- no Desktop binding request apply
- no folder delete/restore behavior change

## Next Slice

B4/B5 should address the actual parity mismatch surfaced by B3a:

- Desktop imported canonical binding count: 12
- Chrome local binding count: 0 in the relaunched smoke profile
- `missingInChromeCount:12`
- `folderCountMismatchCount:4`
