# Local Folder Sync Packaged RC Smoke

Date: 2026-06-24

## Purpose

Record the packaged/local RC folder sync smoke validation after rebuilding the local Tauri app. This evidence covers the existing local Chrome <-> Desktop folder sync loop for read-only parity and create/rename/color mutation roundtrip.

## Artifact Paths

- Packaged local app:
  - `apps/studio/desktop/src-tauri/target/release/bundle/macos/H2O Studio.app`
- Local sync folder:
  - `/Users/hobayda/H2O Studio Sync`
- Desktop smoke command queue:
  - `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json`
- Desktop smoke results directory:
  - `/Users/hobayda/H2O Studio Sync/.h2o-smoke/results`

## Build Commands

```bash
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
cd apps/studio/desktop
npm run tauri:build -- --bundles app
```

The packaged app was opened from:

```text
apps/studio/desktop/src-tauri/target/release/bundle/macos/H2O Studio.app
```

## Packaged Desktop Smoke Gates

- `href`: `tauri://localhost/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders`
- `gatesEnabled`: `true`
- `gatesBlockers`: `[]`
- `gatesSurface`: `desktop-studio`
- `gatesAdapter`: `tauri`
- `queueEnabled`: `true`
- `queueStarted`: `true`
- `commandPath`: `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json`
- `resultsDir`: `/Users/hobayda/H2O Studio Sync/.h2o-smoke/results`

## Read-Only Packaged/Local Smoke

Result:

- Chrome row count: `24`
- Desktop row count: `24`
- `rowCountMatch`: `true`
- `commonFolderCount`: `24`
- `chromeOnlyCount`: `0`
- `desktopOnlyCount`: `0`
- `blockers`: `[]`
- `warnings`: `[]`

## Mutation Packaged/Local Smoke

Command:

```bash
node tools/smoke/local-folder-sync-mutation-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 30000
```

Result:

- `ok`: `true`
- `status`: `mutation-smoke-passed`
- `folderId`: `fold_smoke_zz-5c-mutation-mqruaxjt_mqruaxty_61a2586c9f6e`
- `createdName`: `zz-5c-mutation-mqruaxjt`
- `renamedName`: `zz-5c-desktop-renamed-mqruaxjt`
- `chromeColor`: `#22C55E`
- `desktopColor`: `#A855F7`
- `blockers`: `[]`

Final folder comparison:

- `comparison.folderIdMatch`: `true`
- `comparison.nameMatch`: `true`
- `comparison.colorMatch`: `true`

Final Chrome row:

- `folderId`: matched
- `name`: `zz-5c-desktop-renamed-mqruaxjt`
- `color`: `#A855F7`

Final Desktop row:

- `folderId`: matched
- `name`: `zz-5c-desktop-renamed-mqruaxjt`
- `color`: `#A855F7`

Final model comparison:

- `chromeRowCount`: `25`
- `desktopRowCount`: `25`
- `rowCountMatch`: `true`
- `commonFolderCount`: `25`
- `chromeOnlyCount`: `0`
- `desktopOnlyCount`: `0`

## Warnings

Deferred propagation warnings appeared for labels, tombstones, apply-events, tags, chat-folder-bindings, source metadata, and approved simultaneous conflict.

These warnings are non-blocking for this RC smoke because:

- `blockers`: `[]`
- final folder comparison matched on Chrome and Desktop
- final model parity matched with zero Chrome-only or Desktop-only folders
- deferred categories remain outside this create/rename/color packaged/local smoke scope

## Explicit Exclusions

This packaged/local smoke did not include:

- public Developer ID signing
- notarization
- WebDAV/cloud/relay transport adapters
- delete/tombstone expansion
- restore receipts
- retention/purge
- chat deletion
- snapshot deletion
- raw SQL mutation paths

## Verdict

Packaged/local RC folder sync smoke passed for local Chrome <-> Desktop read-only parity and create/rename/color mutation roundtrip. The packaged Desktop smoke bridge was available inside the rebuilt local Tauri app, Chrome CDP continued to drive Chrome Studio against the same local sync folder, and final Chrome/Desktop parity was clean.
