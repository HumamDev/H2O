# Internal/local sync RC snapshot — local folder sync + delete/restore lifecycle

Date: 2026-06-24

## Snapshot Commit

- Current HEAD SHA: `4a50e1e9ce49a7cc870105508be6f5551ef1b7eb`
- Short SHA: `4a50e1e`
- Subject: `docs(sync): add sync release readiness checkpoint`

## Verdict

Ready for internal/local sync RC testing.

Not public release ready.

This snapshot is scoped to the local Chrome <-> Desktop folder sync milestone and the local delete/restore lifecycle. It must not be treated as a public/premium release.

## Closed Scope

Closed and evidenced for this internal/local RC snapshot:

- folder create / rename / color sync
- Chrome <-> Desktop local transport
- Desktop authoritative delete/restore
- Chrome visible-state-only delete/restore receipts
- Desktop restore receipt export
- Chrome restore receipt import/re-show
- Recently Deleted diagnostics
- retention diagnostics with enforcement deferred
- full delete/restore smoke runner
- packaged delete/restore smoke
- Recently Deleted UI placement
- Folder Sync Health dashboard

## Runtime / Evidence Highlights

Runtime and packaged-path highlights:

- Phase 4D.4 delete/restore runner passed with `blockers:[]`.
- Phase 4F packaged delete/restore smoke passed with `blockers:[]`.
- Retention diagnostics passed with:
  - `retentionEnforcement:"deferred"`
  - `retentionDays:30`
  - `purgeEligibleCount:0`

Safety invariants:

- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- `noTombstoneApplyOnChrome:true`

## Evidence Inventory

Primary evidence paths:

- `release-evidence/2026-06-24/sync-milestone-release-readiness-checkpoint.md`
- `release-evidence/2026-06-24/folder-delete-restore-lifecycle-phase4c-4e-closeout.md`
- `release-evidence/2026-06-24/folder-delete-restore-lifecycle-phase4f-packaged-smoke.md`
- `release-evidence/2026-06-24/folder-delete-restore-recently-deleted-ui-polish-closeout.md`
- `release-evidence/2026-06-24/folder-delete-restore-recently-deleted-ui-placement-closeout.md`
- `release-evidence/2026-06-24/folder-sync-health-dashboard-polish-closeout.md`

## Operational Notes

- Desktop smoke queue requires URL flag: `?h2oSmokeBridge=folder-sync-rc`.
- Manual smoke runs may need stale command clear:
  - `rm -f "/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json"`
- Chrome CDP smoke uses port `9247`.
- Unrelated WIP remains intentionally out of scope.

## Risk / Deferred Scope

This snapshot is safe for internal/local RC testing only.

Do not treat this as public/premium release readiness.

Deferred:

- Developer ID signing and notarization
- public release audit
- purge / hard delete policy
- WebDAV/cloud/relay transport
- full chat-folder binding sync
- cross-device retention ledger
- broader sync scopes beyond current local folder lifecycle

Purge remains blocked. WebDAV/cloud remains a future transport adapter.

## Recommended Next Choices

1. Manual visual QA pass.
2. Optional internal RC artifact/hash record if a packaged app is selected.
3. Later purge design in a separate phase.
4. Later WebDAV/cloud transport design in a separate phase.
5. Later full chat-folder binding sync in a separate phase.
