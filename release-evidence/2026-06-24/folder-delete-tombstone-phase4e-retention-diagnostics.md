# Phase 4E Retention Diagnostics Policy

Date: 2026-06-24

## Scope

Phase 4E clarifies Desktop-side retention countdown diagnostics for folder tombstones.

This phase is diagnostics/policy only:

- No purge.
- No hard delete.
- No Chrome behavior change.
- No WebDAV/cloud/relay.
- No chat deletion.
- No snapshot deletion.
- No production UI panel.

## Files

- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `tools/validation/sync/validate-folder-retention-phase4e.mjs`
- `release-evidence/2026-06-24/folder-delete-tombstone-phase4e-retention-diagnostics.md`

## Policy

Default retention remains `retentionDays:30`.

Row-level retention states:

- `active`: within the retention window.
- `expired`: retention date passed.
- `restored`: tombstone already restored.
- `unknown`: missing or invalid deletion date.
- `deferred`: represented by `retentionEnforcement:"deferred"` because purge enforcement is intentionally not active in this phase.

Since purge is blocked in Phase 4E:

- expired tombstones are not purged.
- expired tombstones may remain restorable when the existing safe restore path supports it.
- diagnostics must make clear that purge enforcement is deferred.

## Row Shape

Recently Deleted rows include:

- `retentionDays`
- `retentionStartedAt`
- `retentionExpiresAt`
- `retentionExpired`
- `retentionCountdownStatus`
- `retentionEnforcement:"deferred"`
- `purgeEligible:false`
- `purgeBlocked:true`
- `hardDeleteBlocked:true`
- `restorePolicy:"allowed-while-purge-deferred"`
- `restoreAvailableReason`
- `purgeBlockedReason:"purge-phase-deferred"`

Expired/restorable rows should explain themselves with:

- `retentionCountdownStatus:"expired"`
- `retentionExpired:true`
- `restoreAvailable:true`
- `restorePolicy:"allowed-while-purge-deferred"`
- `restoreAvailableReason:"retention-expired-but-purge-deferred"`
- `purgeEligible:false`
- `purgeBlockedReason:"purge-phase-deferred"`

## Aggregate Shape

Recently Deleted diagnostics include:

- `activeRetentionCount`
- `expiredRetentionCount`
- `restoredRetentionCount`
- `unknownRetentionCount`
- `purgeEligibleCount:0`
- `purgeBlockedCount`
- `hardDeleteBlockedCount`
- `retentionEnforcement:"deferred"`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

## Runtime Commands

Before runtime proof, the Desktop Studio URL must include:

```text
?h2oSmokeBridge=folder-sync-rc
```

Clear stale queue command:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
```

Check Desktop queue:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op diagnoseHealth \
  --timeout-ms 60000
```

List Recently Deleted retention diagnostics:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op listRecentlyDeletedFolders \
  --timeout-ms 60000
```

Expected:

- `ok:true`
- `blockers:[]`
- `recentlyDeletedDiagnostics` present
- `activeRetentionCount`, `expiredRetentionCount`, `restoredRetentionCount`, and `unknownRetentionCount` present
- `purgeEligibleCount:0`
- `retentionEnforcement:"deferred"`
- `purgeBlocked:true` on rows
- `hardDeleteBlocked:true` on rows
- `noPurge:true`

## Validation

Passed:

```bash
node --check src-surfaces-base/studio/store/folders.tauri.js
node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js
node --check tools/validation/sync/validate-folder-retention-phase4e.mjs
node tools/validation/sync/validate-folder-retention-phase4e.mjs
node tools/validation/sync/validate-folder-recently-deleted-phase4d3.mjs
node tools/validation/sync/validate-folder-delete-restore-phase4d4.mjs
node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs
node tools/validation/sync/validate-folder-delete-request-phase4c.mjs
git diff --check
git diff --cached --check
```

## Runtime Attempt

Runtime command:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op diagnoseHealth \
  --timeout-ms 60000
```

Result:

- `ok:false`
- `status:"desktop-queue-timeout"`
- `blockers:["desktop-queue-timeout"]`
- command path was scoped to `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json`

Interpretation:

- Static implementation and validators are green.
- Live Recently Deleted proof could not run because the Desktop smoke queue was not consuming commands in the current app instance.
- Re-run after Desktop Studio is opened with `?h2oSmokeBridge=folder-sync-rc`, localStorage opt-in `h2o:studio:smoke-bridge:enabled:v1 = folder-sync-rc`, and `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started === true`.

## Verdict

Phase 4E keeps purge and hard delete blocked. Retention expiry is diagnostic only while `retentionEnforcement:"deferred"`. Existing safe restore may remain available for expired tombstones until a later explicit purge/retention enforcement phase is designed and implemented.
