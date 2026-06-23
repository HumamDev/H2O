# Local Folder Sync Mutation Helper Slice 5A

## Purpose

Slice 5A prepares the external smoke tooling for the next local folder-sync RC mutation smoke. It adds explicit mutation opt-in and structured payload support to the Chrome CDP helper and Desktop queue client without adding the combined mutation runner.

The existing green read-only proof remains the baseline:

- Commit: `06ebdaccc88977f74c91474220a79c22360ff76e`
- Chrome and Desktop health: healthy
- Chrome and Desktop folder model counts: `17 / 17`
- Blockers: `[]`
- Warnings: `[]`

## Files Changed

- `tools/smoke/chrome-cdp-studio.mjs`
- `tools/smoke/desktop-folder-sync-queue-client.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs`
- `tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs`
- `tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs`
- `release-evidence/2026-06-23/local-folder-sync-mutation-helper-slice5a.md`

## Helper Changes

Both external helpers now keep read-only operations available without extra flags:

- `diagnoseHealth`
- `getFolderModel`

Both helpers now require `--allow-mutation` before allowing mutation-phase folder-sync smoke operations:

- `createFolder`
- `renameFolder`
- `setFolderColor`
- `syncNow`
- `verifyFolderVisible`
- `verifyFolderHidden`

The helpers reject mutation ops without `--allow-mutation` using `mutation-op-requires-allow-mutation`.

## Payload Rules

Supported payload inputs:

- `--payload-json '{"name":"zz-test","color":"#FF4C4C"}'`
- `--payload-file /path/to/payload.json`

Payload parsing rules:

- Payload must parse as JSON.
- Payload must be a JSON object.
- Arrays, strings, numbers, booleans, and `null` are rejected.
- Payloads are passed as structured values to `H2O.Studio.devSmoke.folderSync.run(op, payload)`.
- No JavaScript expressions are evaluated.
- `eval` and `new Function` remain absent.
- Result payload summaries are redacted for token/secret/password/content-style fields.

## Denied Operations

The external helpers do not allowlist delete, tombstone, purge, restore, raw SQL, chat delete, or snapshot delete operations:

- `requestFolderDelete`
- `applyFolderDeleteRequest`
- `listFolderDeleteRequests`
- `listFolderDeleteReceipts`
- `listActiveFolderTombstones`
- `restoreFolder`
- `deleteFolder`
- `hardDelete`
- `purge`
- `rawSql`
- `deleteChat`
- `deleteSnapshot`

Delete/tombstone mutation smoke remains separate and is not part of Slice 5A.

## Safety Constraints

The helpers continue to report safety flags:

- `noArbitraryEval:true`
- `noRawSql:true`
- `noHardDelete:true`
- `noPurge:true`
- `noTombstonePropagationApply:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noBroadFilesystemAccess:true`

Chrome still uses the fixed CDP registry wrapper:

```js
function(op, payload) { return this.run(op, payload); }
```

Desktop still writes a single command file under:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json
```

and waits for results under:

```text
/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/
```

## Validation Results

Recorded during implementation:

- `node --check tools/smoke/chrome-cdp-studio.mjs` - passed
- `node --check tools/smoke/desktop-folder-sync-queue-client.mjs` - passed
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs` - passed
- `node --check tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs` - passed
- `node --check tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs` - passed
- `node tools/validation/sync/validate-folder-sync-rc-smoke-runner.mjs` - passed
- `node tools/validation/sync/validate-folder-sync-rc-smoke-desktop-client.mjs` - passed
- `node tools/validation/sync/validate-local-folder-sync-readonly-smoke-runner.mjs` - passed
- `node tools/validation/sync/validate-local-folder-sync-mutation-helper-allowlist.mjs` - passed after adding the explicit Chrome `noBroadFilesystemAccess:true` safety flag
- `git diff --check` - passed
- `git diff --cached --check` - passed after staging only Slice 5A helper, validator, and evidence files

## Manual Proof Commands For Next Step

Chrome create folder:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9246 --op createFolder --allow-mutation --payload-json '{"name":"zz-5a-chrome-create","color":"#FF4C4C"}' --timeout-ms 30000
```

Chrome export to Desktop:

```bash
node tools/smoke/chrome-cdp-studio.mjs --mode attach --port 9246 --op syncNow --allow-mutation --payload-json '{"direction":"chrome-to-desktop","reason":"slice-5a-manual-proof"}' --timeout-ms 30000
```

Desktop verify folder visible:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op verifyFolderVisible --allow-mutation --payload-json '{"name":"zz-5a-chrome-create"}' --timeout-ms 30000
```

Desktop rename later:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op renameFolder --allow-mutation --payload-json '{"folderId":"...","name":"zz-5a-renamed"}' --timeout-ms 30000
```

Desktop set color later:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs --op setFolderColor --allow-mutation --payload-json '{"folderId":"...","color":"#10B981"}' --timeout-ms 30000
```

## Deferred

- Combined mutation smoke runner.
- Full create/rename/color roundtrip proof.
- Delete/tombstone mutation smoke.
- Restore, purge, WebDAV/cloud/relay, and public release signing/notarization.
