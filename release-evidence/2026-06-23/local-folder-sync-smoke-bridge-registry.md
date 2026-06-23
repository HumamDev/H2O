# Local Folder Sync Smoke Bridge Registry

Date: 2026-06-23

## Purpose

Implement Slice 2 of the dev-only packaged/local Chrome <-> Desktop folder sync RC smoke bridge: the shared gated in-page command registry.

The prior RC smoke attempt was blocked because automation could not reliably access live Studio globals. This slice adds only the allowlisted registry:

```js
H2O.Studio.devSmoke.folderSync.run(op, payload)
```

It does not add a Chrome CDP runner, Desktop file-command queue, full smoke runner, or any production listener.

## Files Changed

- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `src-surfaces-base/studio/studio.html`
- `tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `release-evidence/2026-06-23/local-folder-sync-smoke-bridge-registry.md`

## Enabled / Disabled Behavior

The registry is loaded into Studio but disabled by default. When disabled, `H2O.Studio.devSmoke.folderSync.run(...)` returns:

- `ok:false`
- `status:"smoke-bridge-disabled"`
- gate diagnostics explaining which gate is missing
- privacy redaction and safety flags

Chosen behavior: install a disabled stub rather than leaving the namespace absent. This makes smoke setup failures explicit and console-verifiable without enabling command execution.

## Required Gates

All gates must pass:

- URL flag: `?h2oSmokeBridge=folder-sync-rc`
- localStorage opt-in: `h2o:studio:smoke-bridge:enabled:v1 === "folder-sync-rc"`
- known local/dev Studio surface
- no public-release flag detected
- explicit operation allowlist

## Allowlisted Ops

- `getFolderModel`
- `createFolder`
- `renameFolder`
- `setFolderColor`
- `syncNow`
- `diagnoseHealth`
- `requestFolderDelete`
- `listFolderDeleteRequests`
- `applyFolderDeleteRequest` - Desktop only
- `listFolderDeleteReceipts`
- `listActiveFolderTombstones`
- `countChatsSnapshots`
- `verifyFolderVisible`
- `verifyFolderHidden`

Unavailable APIs return an unsupported result rather than throwing uncontrolled errors.

## Forbidden Ops / Safety Guarantees

The registry does not expose:

- arbitrary JS/eval
- raw SQL
- hard delete
- purge
- tombstone propagation apply
- chat deletion
- snapshot deletion
- broad filesystem access

Delete-related boundaries:

- `requestFolderDelete` is Chrome-only and routes through the existing request-only review API.
- `applyFolderDeleteRequest` is Desktop-only and routes through the existing Desktop review/apply API.
- `listActiveFolderTombstones` filters active tombstones by `!restoredAt` / `!restored_at`, matching Phase 4 runtime evidence caveats.

Results are redacted by default. Folder IDs/names/colors are allowed for smoke evidence; raw chat content, full snapshot payloads, secrets, and tokens are not returned.

## Manual Enable / Test Commands

Disabled check:

```js
H2O.Studio.devSmoke?.folderSync?.diagnoseGates?.()
await H2O.Studio.devSmoke?.folderSync?.run?.('diagnoseHealth', {
  commandId: 'manual-disabled-health',
  createdAt: new Date().toISOString()
})
```

Enable on a local/dev Studio surface:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc');
const u = new URL(location.href);
u.searchParams.set('h2oSmokeBridge', 'folder-sync-rc');
location.href = u.toString();
```

After reload, confirm gates:

```js
H2O.Studio.devSmoke.folderSync.diagnoseGates()
```

Read the folder display model:

```js
await H2O.Studio.devSmoke.folderSync.run('getFolderModel', {
  commandId: 'manual-get-folder-model',
  createdAt: new Date().toISOString()
})
```

Read health:

```js
await H2O.Studio.devSmoke.folderSync.run('diagnoseHealth', {
  commandId: 'manual-diagnose-health',
  createdAt: new Date().toISOString()
})
```

## Validation

Commands run:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/product/studio/pack-studio.mjs`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `git diff --check`
- `git diff --cached --check`

Results:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js` - pass
- `node --check tools/product/studio/pack-studio.mjs` - pass
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - pass
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - pass, `allowedOpCount:14`
- `git diff --check` - pass
- `git diff --cached --check` - pass

## Loader / Copy-Path Fix

Follow-up date: 2026-06-23

### Live Issue

After commit `3e6343ab4c2ae0bf6583e778d2034a64b4d3c275`, Chrome Studio loaded `studio.html` with:

```html
<script src="./dev/folder-sync-rc-smoke-bridge.studio.js"></script>
```

but the generated Chrome Studio bundle did not contain `surfaces/studio/dev/folder-sync-rc-smoke-bridge.studio.js`, causing:

```text
folder-sync-rc-smoke-bridge.studio.js:1 Failed to load resource: net::ERR_FILE_NOT_FOUND
```

and:

```js
H2O.Studio.devSmoke?.folderSync?.diagnoseGates?.()
// undefined
```

### Root Cause

`src-surfaces-base/studio/studio.html` referenced the registry file, but `tools/product/studio/pack-studio.mjs` uses explicit `ARCHIVE_WORKBENCH_SOURCE_FILES` and `ARCHIVE_WORKBENCH_OUT_FILES` pack lists. The new `dev/folder-sync-rc-smoke-bridge.studio.js` file was not listed, so `npm run dev:all` copied the script tag into generated Chrome Studio HTML without copying the script file.

### Files Changed

- `tools/product/studio/pack-studio.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `release-evidence/2026-06-23/local-folder-sync-smoke-bridge-registry.md`

No registry behavior was changed.

### Inclusion / Copy Behavior

The registry file is now included once in both Studio packer lists:

- `ARCHIVE_WORKBENCH_SOURCE_FILES`
- `ARCHIVE_WORKBENCH_OUT_FILES`

The entry is aligned with the existing dev validation harness order near `dev/f7-folder-color-apply-validation.tauri.js`, matching the `studio.html` script tag position.

After rebuild/prep, the file exists at:

- `apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `apps/extensions/chatgpt/chrome/prod/surfaces/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `apps/studio/desktop/dist/dev/folder-sync-rc-smoke-bridge.studio.js`

### Validation Results

- `npm run dev:all` - pass
- `node apps/studio/desktop/build-tools/prepare-dist.mjs` - pass, copied 275 files into `apps/studio/desktop/dist/`
- `ls apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/dev/folder-sync-rc-smoke-bridge.studio.js apps/extensions/chatgpt/chrome/prod/surfaces/studio/dev/folder-sync-rc-smoke-bridge.studio.js apps/studio/desktop/dist/dev/folder-sync-rc-smoke-bridge.studio.js` - pass
- `rg "folder-sync-rc-smoke-bridge" apps/extensions/chatgpt/chrome/studio-launcher/surfaces/studio/studio.html apps/extensions/chatgpt/chrome/prod/surfaces/studio/studio.html apps/studio/desktop/dist/studio.html apps/studio/desktop/dist/dev/folder-sync-rc-smoke-bridge.studio.js` - pass
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js` - pass
- `node --check tools/product/studio/pack-studio.mjs` - pass
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - pass
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - pass, `allowedOpCount:14`
- `git diff --check` - pass
- `git diff --cached --check` - pass

### Manual Chrome Console Retest

Reload the Studio Launcher extension and Chrome Studio after `npm run dev:all`, then run:

```js
H2O.Studio.devSmoke?.folderSync?.diagnoseGates?.()
```

Then run the disabled command check:

```js
await H2O.Studio.devSmoke?.folderSync?.run?.('diagnoseHealth', {
  commandId: 'manual-disabled-health',
  createdAt: new Date().toISOString()
})
```

Expected:

- no `ERR_FILE_NOT_FOUND` for `folder-sync-rc-smoke-bridge.studio.js`
- registry object is present
- without both `?h2oSmokeBridge=folder-sync-rc` and `localStorage["h2o:studio:smoke-bridge:enabled:v1"] = "folder-sync-rc"`, commands return a clear disabled/gated result
- enabled commands remain unavailable until all gates pass

## Manual Live Proof

Follow-up date: 2026-06-23

Implementation commits:

- Registry implementation: `3e6343ab4c2ae0bf6583e778d2034a64b4d3c275`
- Loader/copy-path fix: `ca6644cd6267fe6c487cb3aefbe4488583ea2b5d`

### Desktop Disabled-State Proof

Surface:

- `desktop-studio`

Adapter:

- `tauri`

`diagnoseGates()` returned:

- `enabled:false`
- `blockers:["url-flag-required","local-storage-opt-in-required"]`
- `knownLocalDevSurface:true`
- `publicReleaseBlocked:true`

Disabled run:

```js
await H2O.Studio.devSmoke.folderSync.run('diagnoseHealth', {
  commandId: 'manual-disabled-health',
  createdAt: new Date().toISOString()
})
```

Returned:

- `ok:false`
- `status:"smoke-bridge-disabled"`
- `disabled:true`
- safety flags true:
  - `noArbitraryEval`
  - `noBroadFilesystemAccess`
  - `noHardDelete`
  - `noPurge`
  - `noRawSql`
  - `noChatDelete`
  - `noSnapshotDelete`
  - `noTombstonePropagationApply`

### Desktop Enabled Proof

Enabled with:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc')
```

and URL flag:

```text
?h2oSmokeBridge=folder-sync-rc
```

`diagnoseGates()` returned:

- `enabled:true`
- `surface:"desktop-studio"`
- `adapter:"tauri"`
- `blockers:[]`

`getFolderModel` returned:

- `ok:true`
- `status:"folder-model-read"`
- `rowCount:17`
- `canonicalRowCount:17`
- `displayModelAvailable:true`

`diagnoseHealth` returned:

- `ok:true`
- `status:"healthy"`
- `verdict:"healthy"`
- `blockers:[]`
- `warnings:[]`
- `summaryText:"Folder sync is current and no blockers are active."`

### Chrome Enabled Proof

Enabled with:

```js
localStorage.setItem('h2o:studio:smoke-bridge:enabled:v1', 'folder-sync-rc')
```

and URL flag:

```text
?h2oSmokeBridge=folder-sync-rc
```

`diagnoseGates()` returned:

- `enabled:true`
- `surface:"chrome-studio"`
- `adapter:"mv3"`
- `blockers:[]`

`getFolderModel` returned:

- `ok:true`
- `status:"folder-model-read"`
- `rowCount:19`
- `canonicalRowCount:19`
- `displayModelAvailable:true`

`diagnoseHealth` returned:

- `ok:true`
- `status:"healthy"`
- `verdict:"healthy"`
- `blockers:[]`
- `warnings:[]`
- `chromeToDesktop.chromeWritesSyncFolder:true`
- `chromeToDesktop.exportApiAvailable:true`
- `chromeToDesktop.permission:"granted"`
- `desktopToChrome.autoImportEnabled:true`

### Live Safety Verdict

- Registry loads on both Desktop and Chrome.
- Disabled-by-default gates work.
- URL + localStorage opt-in enables the bridge.
- Basic read/health commands work.
- No arbitrary eval, hard delete, purge, raw SQL, chat deletion, snapshot deletion, or tombstone propagation apply is exposed.
- Slice 2 is ready for Slice 3: Desktop file-command queue bridge.

### Live-Proof Validation

- `git diff --check` - pass
- `git diff --cached --check` - pass

## Deferred

- Desktop file-command queue bridge
- Chrome CDP helper
- full smoke runner
- packaged/local RC smoke rerun and evidence capture
