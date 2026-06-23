# Local Folder Sync Smoke Bridge Design

Date: 2026-06-23

## Purpose

Design the smallest safe dev-only execution bridge for rerunning the packaged/local Chrome <-> Desktop folder sync RC smoke after the prior smoke attempt was blocked by lack of access to live app globals.

Prior smoke evidence:

- `release-evidence/2026-06-23/local-folder-sync-rc-smoke.md`

The smoke did not fail because of sync behavior. It was blocked because:

- Chrome was not launched with CDP on checked ports `9222`, `9223`, or `9224`.
- Apple Events could inspect Chrome Studio DOM but could not access page globals such as `window.H2O`.
- Inline page-world injection was blocked by the extension/CSP path.
- Desktop Tauri WebView was running but had no external JavaScript/API command bridge.

## Recommendation

Use a hybrid smoke bridge:

- Chrome Studio: CDP launch/helper as the execution transport plus a tiny dev-only in-page smoke command registry.
- Desktop Studio: dev-only Tauri WebView file-command queue that calls the same allowlisted smoke command registry.

This should be implemented in slices. Do not add a broad extension message bridge or arbitrary evaluation surface for the first slice.

## Why This Approach

- Repeatable: the runner controls Chrome launch/debug port and command/result files.
- Low exposure: no public listener and no production command surface.
- No production listener: Desktop uses a local file queue scoped to `.h2o-smoke/`, not an HTTP server.
- No arbitrary eval: both surfaces call an allowlisted command registry.
- Avoids Apple Events and WebView inspector quirks.
- Avoids broad Chrome extension message bridge routing in the first implementation slice.

## Shared Smoke Registry

Proposed surface:

```js
H2O.Studio.devSmoke.folderSync.run(op, payload)
```

The registry exists only when all gates pass:

- explicit URL/dev flag, for example `?h2oSmokeBridge=folder-sync-rc`
- localStorage opt-in, for example `h2o:studio:smoke-bridge:enabled:v1 === "folder-sync-rc"`
- known local/dev surface
- no production/public-release flag

The registry validates the command envelope before dispatch:

- `op`
- `surface`
- `commandId`
- `createdAt`
- `payload`

Results are redacted by default. No secrets, raw chat content, or full snapshot payloads should be returned.

## Chrome Execution

Chrome smoke flow:

1. Launch Chrome with a known remote debugging port using a dedicated smoke profile.
2. Open the Studio extension URL.
3. Use CDP to evaluate only:
   `H2O.Studio.devSmoke.folderSync.run(op, payload)`
4. Return results over CDP.
5. Write runner-collected evidence JSON.

CDP remains external test infrastructure. The app exposes only allowlisted smoke commands and does not expose arbitrary evaluation.

Avoid in the first slice:

- broad Chrome extension background message bridge
- page-world script injection
- arbitrary `Runtime.evaluate` payloads beyond the registry call

## Desktop Execution

Desktop smoke flow:

1. Dev-only bridge polls:
   `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json`
2. The bridge validates the command envelope.
3. It calls:
   `H2O.Studio.devSmoke.folderSync.run(op, payload)`
4. It writes results to:
   `/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/<commandId>.json`

Desktop constraints:

- No HTTP server.
- No arbitrary eval.
- No raw SQL.
- Polling must be scoped and debounced to `.h2o-smoke/`.
- The bridge must report `disabled` unless all gates pass.

## Command Allowlist

Allowed commands:

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

Explicitly forbidden:

- hard delete
- purge
- raw SQL
- arbitrary JavaScript/eval
- tombstone propagation apply
- chat/snapshot deletion

## Safety Gates

- Disabled by default.
- Requires explicit URL/localStorage opt-in.
- Dev/local surface only.
- Explicit command allowlist.
- Schema validation for `op`, `surface`, `commandId`, `createdAt`, and `payload`.
- Redacted result output by default.
- No secrets, raw chat content, or full snapshot payloads in results.
- Bridge reports `disabled` unless all gates pass.
- Desktop file polling is restricted to `.h2o-smoke/`.
- No hard delete, purge, raw SQL, or arbitrary eval command is available.

## Likely Future Files

- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- possible loader/order config only through the normal generator flow
- possible `studio.html` inclusion only if the repo requires explicit script inclusion
- `tools/smoke/folder-sync-rc-smoke.mjs`
- `tools/smoke/chrome-cdp-studio.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-bridge.mjs`

## Implementation Slices

1. Slice 1: design doc only.
2. Slice 2: shared gated smoke command registry.
3. Slice 3: Desktop file-command queue bridge.
4. Slice 4: Chrome CDP helper + smoke runner.
5. Slice 5: rerun packaged/local RC smoke and commit evidence.

This should not be implemented in one prompt. The first implementation after this design should be the shared gated smoke command registry only.

## Risks

- A dev bridge can become an accidental production surface if gating is weak.
- CDP can execute arbitrary JavaScript, so the runner must call only the smoke registry and record that CDP itself is external test infrastructure.
- Chrome File System Access permission may still require first-run setup for the smoke profile.
- Desktop file polling must avoid UI churn.
- Over-broad command results could leak sensitive data if redaction is not enforced.

## Final Design Verdict

Implement the bridge in slices, not in one prompt.

The next implementation slice should add only the shared gated smoke command registry. It should be disabled by default, require explicit local/dev opt-in, expose only allowlisted commands, and make no production behavior change unless explicitly gated and validated.
