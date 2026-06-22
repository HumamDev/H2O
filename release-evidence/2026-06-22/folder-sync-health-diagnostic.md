# Folder Sync Health Diagnostic

Date: 2026-06-22

## Purpose

Phase 3 create/rename/color folder sync is functionally closed, but operators need one trusted, redacted place to inspect folder sync health on both Studio surfaces. This change adds a lightweight public health diagnostic API on Chrome Studio and Desktop Studio without adding timers, polling UI, or broad refresh behavior.

## Diagnostic API

Primary API:

```js
H2O.Studio.sync.folder.health.diagnose()
```

Compatibility alias:

```js
H2O.Studio.sync.folder.diagnoseHealth()
```

Schema:

```js
h2o.studio.sync.folder-health.v1
```

Common fields:

- `schema`
- `version`
- `surface`: `chrome-studio` or `desktop-studio`
- `observedAt`
- `verdict`: `healthy`, `syncing`, `warning`, `blocked`, `degraded`, or `disabled`
- `summaryText`
- `blockers[]`
- `warnings[]`
- `statusCodes[]`
- `privacy.redacted: true`
- `desktopToChrome`
- `chromeToDesktop`
- `uiRefreshHealth`
- `loopPrevention`
- `deferred.deleteTombstone: "deferred"`
- `deferred.webdav: "deferred"`

Blocker/status vocabulary includes:

- `permission-required`
- `no-folder-handle`
- `scheduler-not-fired`
- `auto-sync-disabled`
- `auto-import-disabled`
- `simultaneous-conflict`
- `stale-transport`
- `transport-file-missing`
- `transport-file-malformed`
- `loop-suppressed`
- `duplicate-suppressed`
- `no-op-refresh-suppressed`
- `unknown-state`

## UI Location

No new settings card was added in this repair. The existing Studio settings/UI files are already dirty with unrelated WIP, and adding a live health card would require careful debounced rendering so it does not reintroduce Chrome flicker. The public API is available now for Settings, command-bar, or operator diagnostic UI to consume in a later UI-only pass.

## Files Changed

- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-f19-sync-hardening.mjs`
- `release-evidence/2026-06-22/folder-sync-health-diagnostic.md`

## Validation Commands / Results

```bash
node --check src-surfaces-base/studio/sync/folder-import.mv3.js
node --check src-surfaces-base/studio/sync/folder-sync.tauri.js
node --check tools/validation/sync/validate-f19-sync-hardening.mjs
```

Result: passed.

```bash
node tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs
node tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs
node tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/studio/validate-studio-library-organization-ui.mjs
node tools/validation/sync/validate-f19-shell-row-ux.mjs
```

Result: passed.

Additional targeted coverage was added to `validate-f19-sync-hardening.mjs` to verify:

- Chrome and Desktop health schema exists.
- Both surfaces expose `H2O.Studio.sync.folder.health.diagnose()`.
- Both surfaces expose `H2O.Studio.sync.folder.diagnoseHealth()`.
- Diagnostics are redacted.
- Delete/tombstone and WebDAV are reported as deferred.

## Manual Test Steps

1. Open Chrome Studio Sync Settings or the console diagnostic surface.
2. Run:
   ```js
   await H2O.Studio.sync.folder.health.diagnose()
   ```
3. Open Desktop Studio Sync Settings or the console diagnostic surface.
4. Run:
   ```js
   await H2O.Studio.sync.folder.health.diagnose()
   ```
5. Confirm the verdict is `healthy` when both directions are synced and permissions are available.
6. Change a Desktop folder color and confirm the Chrome health diagnostic updates without visible flicker.
7. Change a Chrome folder color and confirm the Desktop health diagnostic updates without visible flicker.
8. If practical, remove Chrome sync-folder permission and confirm the Chrome diagnostic reports `permission-required` / `no-folder-handle`.
9. Confirm delete/tombstone and WebDAV appear as `deferred`, not failed or complete.

## Remaining Limitations

- This is an API-level health surface only; no new visible Settings card was added in this pass.
- Chrome reports local Chrome knowledge plus Desktop-origin import state. It cannot directly inspect Desktop watcher internals.
- Desktop reports local Desktop watcher/auto-export knowledge. It cannot directly inspect Chrome import state unless that state is reflected through the transport.
- Delete/tombstone lifecycle remains deferred and must be designed before destructive sync propagation is enabled.
- WebDAV/cloud/relay remain later transport adapters and are not implemented here.
