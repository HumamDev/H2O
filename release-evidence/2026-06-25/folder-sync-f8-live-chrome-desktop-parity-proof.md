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

## 2026-07-04 Re-verification After Fresh Desktop Export

A later F8 continuation re-ran the Desktop DevTools export and again flagged the
`14 vs 12` canonical binding gap. Re-investigation from Terminal + repo code
re-confirms this gap is **expected filtering, not a bug**, and confirms the current
on-disk export is clean and internally consistent.

Operator-cited export this round:

- contentSha256: `sha256:0e5e5fdaa82f28b6233648d7abcb6c8210eac35c9cc778cad607c9b31f2dd6b3`
- mirror folder count: `5`, mirror binding count: `5`
- pre-export `listCanonicalChatFolderBindings()`: `14`
- export diagnostic canonical binding count: `12`

That `0e5e5f…` hash and its `5/5` mirror / `14` / `12` numbers are **byte-identical
to the pre-fix "Initial Blocked Export" recorded above** (superseded by the
`58a09933` orphan-item-skip fix). It is a stale/superseded baseline, not a new
regression.

Current on-disk `latest.json` re-read from Terminal (`$HOME/H2O Studio Sync/latest.json`):

- exportId: `b14cb659-fb89-438b-9fdf-8bfb9d5f9070`, sequenceNumber: `3714`
- exportedAt: `2026-07-04T14:39:28.468Z` (file mtime `2026-07-04` local `16:39`)
- schema: `h2o.studio.fullBundle.v2`
- contentSha256: `sha256:bff3205632f5946161b14a4c2fa2bf00ca8559e46eab74678c783ef9acfd7c70`
- fileSha256: `sha256:e537ad3fd75c3805d8d7c934cb81a7baad889099384a88e47f36b217528dcb39`
- `productSyncReady`: not written into bundle (runtime flag `false`)
- `fullBundle.v3`: absent
- `.h2ochat` / archive package body markers: absent (metadata-only)
- folder catalog count: `6`
- `folderState.folders`: `6`, `folderState.items` binding sum: `12`
- `summary.folderBindingCount`: `12`
- `desktopCanonicalChatFolderBindings.bindingCount`: `12`
- `missingFolderBindingCount`: `2`, `activeDanglingFolderBindingCount`: `2`, `deletedFolderBindingCount`: `0`
- `deletedFolderBindingsExcludedFromActiveProjection`: `true`
- `skippedPrimaryOrphanItemBindingCount`: `1`, `primaryOrphanItemBindingAuthority`: `false`
- `fallbackItemsMerged`: `false`, `fallbackBindingAuthority`: `false`

The current export is **clean post-fix**: `folderState.items` (12) = `folderParity`
(12) = `desktopCanonicalChatFolderBindings.bindingCount` (12), all aligned; the pre-fix
`folderState.items = 13` orphan leak is gone; `skippedPrimaryOrphanItemBindingCount = 1`
confirms the `58a09933` fix is live in the running Desktop build.

Live SQLite reconciliation (`org.h2o.studio.desktop/studio-v1.db`, mtime `2026-07-04` `17:41`):

- `folder_bindings` total: `14` (= raw `listCanonicalChatFolderBindings()`)
- bindings pointing at a present `folders` row: `13`
- literally orphaned bindings (folder_id has no `folders` row): `1` (folder_id `69f0ea75-1b38-838d-a930-e72796eba175`)
- `folders` table rows: `67` (only `6` in the active catalog; the rest purged/suppressed/deleted — `desktopPurgedFolderSuppressionCount 61`, `desktopCanonicalRecentlyDeletedCount 3`)

`14 → 12` reconciliation: `14` raw folder_bindings rows − `2` bindings whose folder is
not in the active exported catalog (`missingFolderBindingCount`/`activeDanglingFolderBindingCount`)
− `0` bindings to an actively-deleted folder = `12` active canonical projection. The
export reader `listCanonicalChatFolderBindings()` is a raw `SELECT * FROM folder_bindings
LEFT JOIN folders`; the export projection (export-bundle.tauri.js:1287-1298) then drops
dangling/deleted-folder bindings. This is the F8-locked behavior
(`filterPrimaryFolderItemsByCatalog` / `skippedPrimaryOrphanItemBindings`).

### Proof-integrity note: running-Desktop overwrite

The on-disk `bff320…` bundle (seq `3714`) is **not** the operator-cited `0e5e5f…`
snapshot. A running Desktop auto-exported over the operator's bundle, and the live DB
per-folder distribution differs between the export snapshot and the `17:41` DB read — the
same running-Desktop overwrite/churn mechanism documented in the saved-chat smoke-row
cleanup lane. **The Chrome proof must therefore quiesce Desktop to freeze the bundle and
re-read the live on-disk hash/count at proof time — do not pin the stale `0e5e5f…`.**

### 2026-07-04 verdict

- `14 vs 12` is expected filtering (raw table count vs active canonical projection), not
  a source-of-truth / count-parity bug. No runtime change is warranted or made.
- The current Desktop export path is correct and the fresh export is clean.
- **F8 may continue to the Chrome proof.** The exact Chrome expected count is the **active
  canonical projection = `12`** (compare Chrome `chromeCanonicalBindingCount` /
  `importedDesktopCanonicalBindingCount` against the frozen on-disk bundle's
  `desktopCanonicalChatFolderBindingCount`, currently `12`), **not** the raw API `14`.
- Guards re-run `2026-07-04` (F7 / F8 / F9 canonical-export + parity + readiness, and the
  studio productSyncReady flip-gate): all `PASS`; `productSyncReady:false`;
  `fullBundle.v3` not minted; WebDAV/cloud/archive CAS not implemented.

### Chrome Studio DevTools read-only parity snippet

Run in the Chrome extension Studio DevTools console, on a Studio tab opened with the
gated smoke bridge (`…/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/library`).
Read-only diagnostics only — no `syncNow`, no mutation. Freeze Desktop (quit it) before
running so the on-disk bundle cannot be overwritten mid-proof.

```js
(async () => {
  const fs = H2O?.Studio?.devSmoke?.folderSync;
  if (!fs || !fs.__installed) { console.error('smoke bridge not installed; open with ?h2oSmokeBridge=folder-sync-rc'); return; }
  const parity = await fs.run('diagnoseChatFolderBindingParity', {});
  const visible = await fs.run('diagnoseVisibleFolderParity', {});
  const health = await fs.run('diagnoseHealth', {});
  const p = (parity && parity.result) || parity || {};
  const v = (visible && visible.result) || visible || {};
  console.log(JSON.stringify({
    // Desktop baseline identity (as seen by Chrome) — must match the frozen on-disk bundle
    desktopLatestExportedAt: p.desktopLatestExportedAt || p.importedAt || null,
    desktopBaselineContentSha256: p.desktopBaselineContentSha256 || null,
    // Expected active canonical count = 12
    importedDesktopCanonicalBindingCount: p.importedDesktopCanonicalBindingCount,
    chromeCanonicalBindingCount: p.chromeCanonicalBindingCount,
    chromeDisplayBindingCount: p.chromeDisplayBindingCount,
    totalBindingCount: p.totalBindingCount,
    missingInChromeCount: p.missingInChromeCount,
    extraInChromeCount: p.extraInChromeCount,
    parityComparable: p.parityComparable,
    parityOk: p.parityOk,
    // Folder catalog / visible-set parity
    exportedFolderCatalogCount: v.exportedFolderCatalogCount ?? v.folderCatalogCount,
    chromeVisibleFolderCount: v.chromeVisibleFolderCount,
    desktopVisibleFolderCount: v.desktopVisibleFolderCount,
    chromeOnlyVisibleFolderCount: v.chromeOnlyVisibleFolderCount,
    desktopOnlyVisibleFolderCount: v.desktopOnlyVisibleFolderCount,
    // Boundary guards (must all hold)
    productSyncReady: p.productSyncReady ?? false,
    noChromeDestructiveBindingApply: p.noChromeDestructiveBindingApply,
    noDesktopCanonicalMutation: p.noDesktopCanonicalMutation,
    health: (health && (health.result || health)) || null,
  }, null, 2));
})();
```

PASS criteria: `parityOk: true`, `parityComparable: true`,
`chromeCanonicalBindingCount === importedDesktopCanonicalBindingCount === 12`
(matching the frozen on-disk bundle's `desktopCanonicalChatFolderBindingCount`),
`missingInChromeCount: 0`, `extraInChromeCount: 0`, `productSyncReady: false`, and no
Chrome-side mutation. If Chrome's imported baseline hash/exportedAt does not match the
current frozen on-disk bundle, re-import first (operator action) and re-read — do not
compare against a stale import.

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
