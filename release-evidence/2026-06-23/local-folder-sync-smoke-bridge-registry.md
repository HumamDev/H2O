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
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `git diff --check`
- `git diff --cached --check`

Results:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js` - pass
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - pass
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs` - pass, `allowedOpCount:14`
- `git diff --check` - pass
- `git diff --cached --check` - pass

## Deferred

- Desktop file-command queue bridge
- Chrome CDP helper
- full smoke runner
- packaged/local RC smoke rerun and evidence capture
