# Folder Sync F8 - Live Chrome / Desktop Folder Parity Proof

F8 LIVE CHROME / DESKTOP FOLDER PARITY PROOF - BLOCKED

## Result

F8 did not proceed to Chrome proof. The Desktop DevTools export succeeded, but Terminal verification of the fresh `latest.json` found a remaining Desktop export count mismatch that must be resolved before Chrome-visible parity can be trusted.

## Desktop Export

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

## Terminal Verification

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

This evidence remains `BLOCKED` until a fresh Desktop export is rerun and proves the expected counts. Chrome proof must not proceed before that clean Desktop export.

## Decision

F8 is blocked. Do not proceed to Chrome proof yet.

The correct Chrome expected active canonical count is `12`, but Chrome proof should wait until the exported `folderState.items` count also agrees with the active canonical projection or is explicitly filtered out before import/display parity.

## Minimal Fix

Patch the Desktop export path so `folderState.items` is constrained to the canonical folder catalog:

- keep item buckets only for folder ids present in exported `folders`
- count skipped primary orphan item bindings separately
- keep fallback mirror bindings skipped as already implemented in F7
- preserve `desktopCanonicalChatFolderBindings` as the active canonical projection
- keep `productSyncReady:false`

Likely target:

- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`

Validator follow-up should extend F7/F8 coverage to prove:

- raw canonical count may be greater than active projection count when dangling folder bindings exist
- active exported canonical count is the Chrome comparison count
- `folderState.items` excludes orphan folder ids not present in the folder catalog
- skipped orphan primary item count is recorded

## Boundaries Preserved

- No Chrome proof was run after the discrepancy was found.
- No archive package code was touched.
- No WebDAV/cloud/archive CAS implementation.
- No `fullBundle.v3` mint.
- No `productSyncReady` flip.
- No multi-writer or catalog CRUD implementation.
