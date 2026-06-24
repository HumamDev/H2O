# Folder Delete / Restore Lifecycle Phase 4C-4E Closeout

Date: 2026-06-24

## Executive Verdict

The local folder delete/restore lifecycle is closed for the local folder sync RC.

Desktop remains authoritative for destructive lifecycle actions. Chrome remains a companion surface: it can request delete, import status-only delete/restore receipts, and update its visible folder mirror, but it does not directly delete folders, apply tombstones, create tombstones, purge, or mutate chats/snapshots.

The completed local loop is:

1. Chrome requests folder delete.
2. Chrome exports the exact pending request.
3. Desktop imports and reviews the request.
4. Desktop explicitly applies soft delete.
5. Desktop exports a status-only delete receipt.
6. Chrome imports the receipt and hides the folder in visible state only.
7. Desktop restores the folder.
8. Desktop exports a status-only restore receipt.
9. Chrome imports the restore receipt and re-shows the folder in visible state only.
10. Recently Deleted diagnostics expose retention countdown policy without enabling purge.

## Closed Phases

- Phase 4C: Chrome request -> Desktop apply -> Desktop delete receipt export -> Chrome receipt import -> Chrome visible-state hide.
- Phase 4D.1: Desktop status-only folder restore receipt export.
- Phase 4D.2: Chrome restore receipt import and visible-mirror re-show.
- Phase 4D.3: Desktop Recently Deleted diagnostics/list API.
- Phase 4D.4: full local delete/restore lifecycle smoke runner.
- Phase 4E: retention countdown policy and diagnostics surfacing.

Latest closeout/runtime commits:

- `28e4e8007cdfcb011b51c112c0ddc5ac48978cdb` - full Phase 4D.4 runner passed.
- `5db7e2255a2f93c72890e131cdc10e0787edc994` - Phase 4E retention runtime surfacing passed.

## Runtime Proof Summary

The Phase 4D.4 smoke runner proved the full local delete/restore lifecycle:

- delete request created on Chrome
- exact `requestId` / `folderId` exported in `chrome-latest.json`
- exact request imported and found on Desktop
- Desktop soft delete applied through the reviewed Desktop authority path
- active folder tombstone created on Desktop
- Chrome imported status-only delete receipt
- Chrome hid the folder from visible mirror only
- Desktop restored the folder
- Desktop exported status-only restore receipt
- Chrome imported restore receipt
- Chrome re-shown the folder in visible mirror only
- final Chrome visible state was true
- final Desktop visible state was true
- same-surface chat counts did not decrease
- same-surface snapshot counts did not decrease

The Phase 4E runtime diagnostics proof showed:

- `ok:true`
- `status:"recently-deleted-folders-listed"`
- `blockers:[]`
- `retentionDays:30`
- `retentionEnforcement:"deferred"`
- `activeRetentionCount:24`
- `expiredRetentionCount:4`
- `restoredRetentionCount:10`
- `unknownRetentionCount:0`
- `purgeEligibleCount:0`
- `purgeBlockedCount:38`
- `hardDeleteBlockedCount:38`
- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`

The retention proof also showed active, restored, and expired row policy fields. Expired rows remain `purgeEligible:false` with `restorePolicy:"allowed-while-purge-deferred"` and `purgeBlockedReason:"purge-phase-deferred"`.

## Safety Invariants

The closed lifecycle preserves these invariants:

- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noTombstoneApplyOnChrome:true`
- Chrome does not directly delete folders.
- Chrome does not apply or create folder tombstones.
- Chrome delete receipt import is status bookkeeping plus visible-state hide.
- Chrome restore receipt import is visible-state re-show only.
- Desktop remains the only authority for folder soft delete and restore.
- Desktop delete uses the existing safe soft-delete/tombstone path.
- Repeated imports/apply operations are idempotent or fail safely with explicit blockers.

## Retention Policy

Retention is diagnostic-only in Phase 4E:

- `retentionDays:30`
- `retentionEnforcement:"deferred"`
- `purgeEligibleCount:0`
- expired tombstones are not purged
- expired tombstones may remain restorable while purge enforcement is deferred
- purge remains blocked with `purgeBlockedReason:"purge-phase-deferred"`
- hard delete remains blocked

Retention state meanings:

- `active`: within the retention window.
- `expired`: retention date has passed.
- `restored`: tombstone already restored.
- `unknown`: missing or invalid deletion date.
- `deferred`: enforcement status, represented by `retentionEnforcement:"deferred"`.

## Evidence Links

Core closeout/proof evidence:

- `release-evidence/2026-06-23/folder-delete-tombstone-phase4c-closeout.md`
- `release-evidence/2026-06-24/folder-delete-tombstone-phase4d4-delete-restore-smoke.md`
- `release-evidence/2026-06-24/folder-delete-tombstone-phase4e-retention-diagnostics.md`

Phase 4C receipt/hide evidence:

- `release-evidence/2026-06-23/folder-delete-tombstone-phase4c4-receipt-export.md`
- `release-evidence/2026-06-23/folder-delete-tombstone-phase4c4-receipt-import.md`
- `release-evidence/2026-06-23/folder-delete-tombstone-phase4c4-chrome-hide.md`

Phase 4D restore/recently-deleted evidence:

- `release-evidence/2026-06-24/folder-delete-tombstone-phase4d-restore-receipt-export.md`
- `release-evidence/2026-06-24/folder-delete-tombstone-phase4d2-restore-receipt-import.md`
- `release-evidence/2026-06-24/folder-delete-tombstone-phase4d3-recently-deleted-diagnostics.md`

Related local folder sync RC evidence:

- `release-evidence/2026-06-24/sync-rc-local-folder-sync-closeout.md`
- `release-evidence/2026-06-24/local-folder-sync-packaged-rc-smoke.md`

## Operational Notes

Manual Desktop smoke runs require Desktop Studio to be opened with:

```text
?h2oSmokeBridge=folder-sync-rc
```

The Desktop smoke bridge also requires localStorage opt-in:

```text
h2o:studio:smoke-bridge:enabled:v1 = folder-sync-rc
```

During manual smoke runs, stale command files may need to be cleared:

```bash
rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"
```

The queue should report healthy before lifecycle smoke runs:

```bash
node tools/smoke/desktop-folder-sync-queue-client.mjs \
  --op diagnoseHealth \
  --timeout-ms 60000
```

## Deferred Items

Deferred out of this closeout:

- purge design and purge implementation
- WebDAV/cloud/relay transport
- UI-heavy Recently Deleted panel
- cross-device retention ledger
- full chat-folder binding sync
- public signing/notarization
- broader multi-device tombstone propagation

## Final Recommendation

The next phase should be either:

- packaged/local re-run of the delete/restore smoke runner, or
- operator UI polish for Recently Deleted diagnostics and restore visibility.

Do not start purge or WebDAV/cloud/relay in the next immediate slice. The local lifecycle is now proven soft-delete/restore safe, and the next work should keep that evidence boundary intact before adding irreversible lifecycle behavior.
