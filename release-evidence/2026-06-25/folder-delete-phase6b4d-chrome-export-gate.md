# Phase 6B.4d - Chrome Export Gate Enablement

## Verdict

Phase 6B.4d fixes the Chrome sync-folder export gate that blocked `chrome-latest.json` even after the sync folder handle was connected and granted.

## Root Cause

Chrome export had two separate gates:

- the connected File System Access folder handle, and
- the Chrome export write gate, backed by `sync.chromeAutoImport` or the smoke-only export opt-in.

The Connect Folder flow correctly restored the folder handle and permission, but it did not enable the write gate. The Settings control labelled `Enable Export on Save` only wired the event trigger, so the master `sync.chromeAutoImport` flag could remain false. Health then reported:

- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:false`
- `blockers:["chrome-export-flag-off"]`

That left `syncNow({ direction:"chrome-to-desktop" })` blocked with `chrome-to-desktop-export-flag-off`.

## Fix

The Chrome export enablement path now uses one source of truth:

- `autoImport.enable()` sets the master `sync.chromeAutoImport` gate and the event-trigger gate.
- `autoImport.disable()` clears both gates.
- explicit `enableChromeExport()` / `disableChromeExport()` helpers expose the master gate for diagnostics and future UI use.
- the Settings Chrome control is labelled `Enable Chrome Export` / `Disable Chrome Export`, making it distinct from Desktop Auto Export.
- the smoke bridge sets the Chrome smoke export opt-in during Chrome `diagnoseHealth` and Chrome-to-Desktop `syncNow` when the normal RC smoke bridge opt-in is present.
- Chrome health now reports `chromeWritesSyncFolder:true` when a folder handle is connected and the same export gate used by `exportNow()` is enabled, even before the first export succeeds.

## Expected Runtime Proof

After opening Chrome Studio with `?h2oSmokeBridge=folder-sync-rc`, connecting `/Users/hobayda/H2O Studio Sync`, and enabling Chrome export if using the UI:

```js
await H2O.Studio.devSmoke.folderSync.run({ op: "diagnoseHealth" })
```

Expected:

- `ok:true`
- `status:"healthy"`
- `connected:true`
- `permission:"granted"`
- `noFolderHandle:false`
- `chromeWritesSyncFolder:true`
- `blockers:[]`

Then:

```js
await H2O.Studio.devSmoke.folderSync.run({
  op: "syncNow",
  payload: {
    direction: "chrome-to-desktop",
    reason: "phase6b4d-export-gate-proof"
  }
})
```

Expected:

- `ok:true`
- `status:"chrome-to-desktop-exported"`
- `transport:"chrome-latest.json"`
- `bytes > 0`
- `blockers:[]`

## Runtime Attempt

Commands run:

```bash
npm run dev:all
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9247 --op diagnoseHealth --timeout-ms 60000
```

Result before extension reload:

- Chrome Studio target was present.
- Folder handle was connected and granted.
- Runtime still showed the old gate state:
  - `connected:true`
  - `permission:"granted"`
  - `noFolderHandle:false`
  - `chromeWritesSyncFolder:false`
  - `blockers:["chrome-export-flag-off"]`
- The result did not include the new `chromeExportSmokeOptInEnsured` field, so the live page was still running the stale extension page bundle.

After `npm run dev:all`, the rebuilt Studio Launcher assets contained the new markers:

- `ensureChromeSmokeExportOptIn`
- `chromeExportSmokeOptInEnsured`
- `setMasterFlag(true)`
- `Enable Chrome Export`

The source and rebuilt Studio Launcher files matched for:

- `sync/auto-import.mv3.js`
- `sync/folder-import.mv3.js`
- `dev/folder-sync-rc-smoke-bridge.studio.js`

An extension reload was attempted through the extension page with `chrome.runtime.reload()`. Chrome accepted the reload call, but after reload the CDP browser no longer exposed the Studio Launcher extension targets:

- `status:"chrome-load-extension-ignored"`
- `blockers:["chrome-load-extension-ignored","studio-launcher-extension-not-loaded"]`
- `loadedExtensionIds:[]`

Runtime proof is therefore blocked on relaunching Chrome Dev with the unpacked Studio Launcher extension loaded. This is a runtime/operator state blocker, not a source/build validation failure.

## Safety

- no Chrome permanent delete
- no Chrome purge authority
- no Chrome restore authority
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- no WebDAV/cloud/relay behavior

## Validation

- `npm run dev:all`
- `node --check` on changed JS/MJS files
- `node tools/validation/sync/validate-folder-delete-phase6b4d-chrome-export-gate.mjs`
- existing Phase 6B delete validators
- `git diff --check`
- `git diff --cached --check`
