# Local Folder Sync Chrome Color Stale Guard Fix

Date: 2026-06-23

## Purpose

Fix the Slice 5B Chrome color mutation blocker after the create/rename flow had already proven:

- Chrome created `zz-5a-chrome-create`
- Desktop imported it
- Desktop renamed it to `zz-5b-desktop-renamed`
- Chrome imported the rename
- Chrome verified the renamed folder by id

The failing Chrome smoke command was:

```bash
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op setFolderColor \
  --allow-mutation \
  --payload-json '{"folderId":"fold_smoke_zz-5a-chrome-create_mqr1i0co_9d3c10ab68c7","color":"#22C55E"}' \
  --timeout-ms 30000
```

It returned `not-ok` with blocker `stale-guard-required`.

## Root Cause

The smoke registry called the generic Chrome folder color path in apply mode without the required freshness guard. The Chrome folder metadata color resolver requires:

- `staleGuard.sourceHash`
- `staleGuard.previewHash`

Those values are returned by the preview phase. Without them, apply mode blocks with `stale-guard-required`.

## Fix

The smoke registry now uses a Chrome-specific color path before `actions.folders.update`:

1. read the current folder row from `H2O.Library.FolderParity.getDisplayModel({ fresh:true })`
2. build the `change-folder-color` metadata operation
3. request preview mode
4. copy the preview `staleGuard` into the apply operation
5. request apply mode
6. read the folder model again and verify the same folder id has the requested color

Successful results return:

- `ok:true`
- `status:"folder-color-set"`
- `folderId`
- `color`
- `iconColor`
- `colorPathUsed:"folder-metadata-preview-apply"`
- `staleGuardProvided:true`
- `staleGuardSource:"folder-metadata-preview"`
- `folderFoundBefore`
- `folderFoundAfter`
- `colorBefore`
- `colorAfter`

## Files Changed

- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `release-evidence/2026-06-23/local-folder-sync-chrome-color-stale-guard-fix.md`

## Safety

No delete/tombstone operation was added. The smoke bridge remains limited to the existing Slice 5 mutation allowlist.

Still preserved:

- no arbitrary eval
- no raw SQL
- no hard delete
- no purge
- no tombstone propagation apply
- no chat delete
- no snapshot delete
- no broad filesystem access

## Validation

Run:

- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `node tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs`
- `git diff --check`
- `git diff --cached --check`

## Retest

```bash
node tools/smoke/chrome-cdp-studio.mjs \
  --mode attach \
  --port 9247 \
  --op setFolderColor \
  --allow-mutation \
  --payload-json '{"folderId":"fold_smoke_zz-5a-chrome-create_mqr1i0co_9d3c10ab68c7","color":"#22C55E"}' \
  --timeout-ms 30000
```

Expected:

- `ok:true`
- `status:"folder-color-set"` or `status:"ok"`
- `result.ok:true`
- `result.folderId:"fold_smoke_zz-5a-chrome-create_mqr1i0co_9d3c10ab68c7"`
- `result.color:"#22C55E"`
- `result.blockers:[]`
