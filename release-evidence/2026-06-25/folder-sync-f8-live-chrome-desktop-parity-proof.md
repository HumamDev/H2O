# Folder Sync F8 - Desktop Export Parity Proof

F8 DESKTOP EXPORT PARITY - PASSED_DESKTOP_EXPORT_PARITY

F8 CHROME DESKTOP FOLDER PARITY - PASSED_CHROME_DESKTOP_FOLDER_PARITY

## Result

F8 Desktop export parity passed after the committed export parity fix:

- fix commit: `58a09933bfe52388a5e714a16f30647ad3ef05a1`
- fix commit message: `fix(sync): skip orphan folder export items`
- Desktop export parity verdict: `PASSED_DESKTOP_EXPORT_PARITY`
- Chrome proof status: `PASSED_CHROME_DESKTOP_FOLDER_PARITY`

F8 Chrome proof used existing gated Chrome Studio CDP diagnostics against the already imported clean Desktop export. The direct `syncNow({ direction: "desktop-to-chrome" })` import command was not run by the agent because live-profile mutation was rejected by policy; this is not a parity blocker because read-only diagnostics showed Chrome had already imported the Desktop export from `2026-07-01T10:59:17.139Z`.

## Initial Blocked Export

The initial F8 Desktop DevTools export succeeded, but Terminal verification of the fresh `latest.json` found a Desktop export count mismatch that had to be resolved before Chrome-visible parity could be trusted.

Operator-run Desktop Studio DevTools export:

- status: `latest-sync-bundle-written`
- schema: `h2o.studio.fullBundle.v2`
- productSyncReady: `false`
- contentSha256: `sha256:0e5e5fdaa82f28b6233648d7abcb6c8210eac35c9cc778cad607c9b31f2dd6b3`
- path: `$HOME/H2O Studio Sync/latest.json`
- mirror source: `chrome.storage.local`
- mirror folder count: `5`
- mirror binding count: `5`
- pre-export `listCanonicalChatFolderBindings()` count: `14`
- export diagnostic canonical active binding count: `12`
- folder catalog count: `6`
- fallbackUsed: `false`

## Initial Terminal Verification

Fresh file inspected:

- path: `$HOME/H2O Studio Sync/latest.json`
- mtime: `2026-07-01T10:30:36.038Z`
- schema: `h2o.studio.fullBundle.v2`
- contentSha256: `sha256:0e5e5fdaa82f28b6233648d7abcb6c8210eac35c9cc778cad607c9b31f2dd6b3`
- fileSha256: `sha256:cc1d40e6cb8f2a20973f8c9dbff93b069f7a93ea248d5d46c6c8abfc1b1fe0d3`
- `fullBundle.v3`: absent
- `.h2ochat` / archive package body markers: absent
- folder catalog count: `6`
- folder-state source: `desktop-sqlite`
- fallback source: `chrome.storage.local`
- fallbackUsed: `false`
- skippedFallbackBindingCount: `5`
- fallbackBindingAuthority: `false`
- fallbackItemsMerged: `false`
- desktopCanonicalChatFolderBindings bindingCount: `12`
- desktopCanonicalChatFolderBindings missingFolderBindingCount: `2`
- desktopCanonicalChatFolderBindings activeDanglingFolderBindingCount: `2`
- folderParity bindingCount: `12`
- exported `folderState.items` binding count: `13`

## 14 vs 12 Explanation

The raw Desktop API count of `14` is from `H2O.Studio.store.folders.listCanonicalChatFolderBindings()`. That reader selects all rows from `folder_bindings` with a left join to `folders`.

The export projection then filters bindings whose `folder_id` is not in the current canonical folder catalog. In the fresh export:

- raw canonical binding rows before projection: `14`
- active dangling / missing-folder binding rows: `2`
- exported active canonical binding rows: `12`

That part is expected filtering. Chrome proof should compare against the exported active canonical projection count of `12`, not the raw API count of `14`.

## Remaining Blocker

The export is still internally inconsistent:

- `desktopCanonicalChatFolderBindings.bindingCount`: `12`
- `folderParity.bindingCount`: `12`
- `folderState.items` binding count: `13`

The extra `folderState.items` row is an orphan item bucket:

- folderId: `f_0606ea698948f19dba53d548`
- folder is absent from the exported folder catalog
- chatId: `69f0c5f3-30c4-83eb-9240-26331d09532b`

This row is not from the skipped mirror fallback. The mirror fallback is correctly skipped. The row leaks through the primary chat archive / folder item path, because `buildFolderState()` seeds `items` from collected chat organization before canonical folder-id filtering.

Plain-language blocker summary for the F8 validator: `folderState.items count of 13 is a real export bug`.

## F8 Blocker Fix Applied

Patch target:

- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`

The Desktop export path now constrains `folderState.items` to the exported canonical folder catalog:

- `folderState.items is constrained to the exported canonical folder catalog`
- item buckets whose `folderId` is absent from exported `folderState.folders` are skipped
- skipped primary orphan bindings are diagnosed separately
- skipped primary orphan item diagnostics:
  - `skippedPrimaryOrphanItemBindingCount`
  - `skippedPrimaryOrphanItemBindings`
  - `primaryOrphanItemBindingAuthority: false`
- skipped fallback mirror bindings remain skipped
- `fallbackBindingAuthority: false`
- `fallbackItemsMerged: false`

Expected fresh Desktop rerun counts after this fix:

- `folderState.items count = 12`
- `folderParity.bindingCount = 12`
- `desktopCanonicalChatFolderBindings.bindingCount = 12`
- `skippedPrimaryOrphanItemBindingCount = 1` for the current known orphan row, or the current equivalent count if live data changes before rerun
- `productSyncReady:false`
- no `fullBundle.v3`
- no WebDAV/cloud/archive CAS markers
- no Chat Saving package body markers

The fresh Desktop export was rerun after the fix and proved the expected counts.

## Fresh Desktop Export After Fix

Desktop Studio DevTools fresh export:

- exportedAt: `2026-07-01T10:59:17.139Z`
- latest path: `~/H2O Studio Sync/latest.json`
- latest mtime observed by terminal: `2026-07-01T10:59:17.156Z`
- schema: `h2o.studio.fullBundle.v2`
- contentSha256: `sha256:6c79db9cd2adc045f914ae7ae9e64913afc7f4ac55c8248ca08c5f40265a5eb4`
- fileSha256: `sha256:fb2303ff9c3cc59163304709740913a38b0cd2c32b5128bff7e634d0ba5da95a`
- `productSyncReady`: `false`
- folderCatalogCount: `6`
- `folderState.items` count: `12`
- `folderParity.bindingCount`: `12`
- `desktopCanonicalChatFolderBindings.bindingCount`: `12`
- skippedPrimaryOrphanItemBindingCount: `1`
- primaryOrphanItemBindingAuthority: `false`
- fallbackBindingAuthority: `false`
- fallbackItemsMerged: `false`
- orphanFolderCount: `0`
- fullBundleV3Present: `false`
- webdavCloudArchiveCasMarkersPresent: `false`
- chatSavingPackageBodyMarkersPresent: `false`

The DevTools `copy()` helper failed with `ReferenceError: Can't find variable: copy`, but the full JSON was logged and returned. This is not a proof blocker.

## Decision

F8 Desktop export parity passed.

The correct Chrome expected active canonical count is `12`. Chrome proof was collected from this clean Desktop export baseline and passed.

## Chrome Proof After Desktop Pass

Chrome Studio target:

- surface: `chrome-extension-studio`
- adapter: `mv3`
- CDP port: `9247`
- target URL: `chrome-extension://<redacted>/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/library/category/cat_product_ux_design`
- proof mode: existing gated read-only diagnostics
- direct mutation/import attempt: not executed by agent because live Chrome profile mutation was rejected by policy
- Chrome proof verdict: `PASSED_CHROME_DESKTOP_FOLDER_PARITY`

Desktop latest identity observed by Chrome diagnostics:

- Desktop latest exportedAt: `2026-07-01T10:59:17.139Z`
- Desktop visible set importedAt: `2026-07-01T11:08:06.161Z`
- Desktop latest path: `H2O Studio Sync/latest.json`
- Desktop latest file size: `849375`
- Desktop latest file last modified: `1782903557155`
- Desktop baseline contentSha256: `sha256:6c79db9cd2adc045f914ae7ae9e64913afc7f4ac55c8248ca08c5f40265a5eb4`
- Desktop baseline fileSha256: `sha256:fb2303ff9c3cc59163304709740913a38b0cd2c32b5128bff7e634d0ba5da95a`
- schema: `h2o.studio.fullBundle.v2`

Chrome folder catalog / visible-set parity:

- exported folder catalog count: `6`
- Chrome known canonical fallback raw folder count: `6`
- Desktop latest visible folder count: `5`
- Chrome visible folder count: `5`
- Chrome-only visible folder count: `0`
- Desktop-only visible folder count: `0`
- latest-only visible folder count: `0`
- duplicate names with different ids: `0`
- hidden-but-exported count: `0`
- visible-but-not-exported count: `0`
- desktop fallback mirror visible authority: `false`
- desktop fallback mirror metadata fill only: `true`
- no tombstone apply on Chrome: `true`
- no tombstone create on Chrome: `true`

Chrome folder binding parity:

- canonical source: `desktop-canonical-chat-folder-bindings`
- totalBindingCount: `12`
- importedDesktopCanonicalBindingCount: `12`
- chromeBindingCount: `12`
- chromeDisplayBindingCount: `12`
- chromeCanonicalBindingCount: `12`
- comparableBindingCount: `12`
- missingInChromeCount: `0`
- extraInChromeCount: `0`
- folderCountMismatchCount: `0`
- desktopInvalidBindingCount: `0`
- chromeInvalidBindingCount: `0`
- parityComparable: `true`
- parityOk: `true`
- chromeCanonicalBindingProjectionAvailable: `true`
- chromeCanonicalBindingProjectionSchema: `h2o.studio.chat-folder-bindings.desktop-canonical.v1`
- chatFolderBindingRequestPendingCount: `0`
- chromePendingBindingRequestCount: `0`
- chatFolderBindingRequestTotalCount: `0`
- chromeBindingRequestsAreRequestOnly: `true`
- noChromeDestructiveBindingApply: `true`
- noDesktopCanonicalMutation: `true`

Chrome product / transport boundary proof:

- productSyncReady: `false`
- fullBundleV3Present: `false`
- webdavCloudArchiveCasMarkersPresent: `false`
- chatSavingPackageBodyMarkersPresent: `false`
- no Chrome canonical folder mutation: `true`
- no Chrome destructive folder apply: `true`
- no hard delete: `true`
- no purge: `true`
- no chat delete: `true`
- no snapshot delete: `true`
- no folder binding repair/write-through: `true`

The read-only diagnostics contained raw runtime rows in command output, but this evidence records only redacted paths, counts, hashes, booleans, and schemas. No raw chat titles/content are included here.

## Fix Summary

Patch the Desktop export path so `folderState.items` is constrained to the canonical folder catalog:

- keep item buckets only for folder ids present in exported `folders`
- count skipped primary orphan item bindings separately
- keep fallback mirror bindings skipped as already implemented in F7
- preserve `desktopCanonicalChatFolderBindings` as the active canonical projection
- keep `productSyncReady:false`
- no mirror write-through or repair was implemented
- binding mismatch is not auto-repaired
- sortOrder is not blindly overwritten

Likely target:

- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`

Validator follow-up should extend F7/F8 coverage to prove:

- raw canonical count may be greater than active projection count when dangling folder bindings exist
- active exported canonical count is the Chrome comparison count
- `folderState.items` excludes orphan folder ids not present in the folder catalog
- skipped orphan primary item count is recorded
- Chrome proof passed from the clean Desktop export baseline

## Boundaries Preserved

- Chrome proof was run through gated read-only diagnostics only.
- No agent-driven live Chrome import mutation was performed.
- No archive package code was touched.
- No WebDAV/cloud/archive CAS implementation.
- No `fullBundle.v3` mint.
- No `productSyncReady` flip.
- No multi-writer or catalog CRUD implementation.
- No mirror write-through or repair implementation.
- Future shared transport must support Desktop Studio, Chrome/native extension across devices, and mobile app, but F8 implements no mobile or remote transport.
