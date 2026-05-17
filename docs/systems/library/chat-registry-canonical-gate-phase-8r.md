# ChatRegistry Canonical Gate - Phase 8R

Status: Gate summary only. No live canonical reads approved.

Date: 2026-05-17

Related:
- [ADR-0006 Shared Library Storage Tier](../../decisions/ADR-0006-shared-library-storage-tier.md)
- [Library Migration Plan](../../architecture/library-migration-plan.md)
- [Library Storage](storage.md)

## Scope

Phase 8 proved the ChatRegistry canonical storage path as a bounded diagnostic and mirror path in the new Studio-only extension context. This report records the gate state after phases 8I through 8Q.

The active canonical test context is the new Studio-only extension. Its storage origin is isolated from earlier extension builds, so the canonical `h2o.library.shared` IndexedDB state is specific to that extension ID.

## Proven

- Minimal background-owned IndexedDB schema exists for `h2o.library.shared`.
- Required stores exist: `chatRegistry`, `migrationState`, and `syncState`.
- Bounded ChatRegistry mirror write works with explicit approval.
- Mirror verification works and reports `mirror-verified`.
- Single-record canonical diagnostic read works and reports `record-verified`.
- Full mirrored-record diagnostic read works and reports `full-mirror-read-verified`.
- Dual-read dry-run comparison works and reports `dual-read-dry-run-matched`.
- Drift detection works and can identify when a mirror refresh is required.
- Controlled mirror refresh works and can repair detected drift.
- Runtime-confirmed mirror state has 4 ChatRegistry records in the canonical `chatRegistry` store.
- `migrationState` and `syncState` remain untouched.

## Still Disabled

- Generic `StorageAdapter.read()`.
- Generic `StorageAdapter.write()`.
- Live canonical reads.
- Live dual-read execution.
- Dual-write.
- Automatic mirror refresh.

## Not Migrated

- Folders.
- Categories.
- Labels.
- Tags.
- Projects.
- Archive refs.
- UI prefs.
- Other Library Index or provider-owned state.

## Known Risks

- IndexedDB state is scoped to the extension origin and extension ID; a new Studio-only extension does not inherit canonical DB state from an older extension origin.
- ChatRegistry mirror drift can happen after mirror write because legacy Studio registry state may continue to change.
- Mirror refresh is explicit and approval-gated, not automatic.
- Archive authorization remains separate for archive-protected operations.
- There is no cross-extension canonical DB import path.
- No live provider or LibraryIndex read path has been switched to canonical storage.

## Gate Decision

ChatRegistry canonical storage is proven as a diagnostic and bounded mirror path only.

It is not approved for live canonical reads, live dual-read execution, or dual-write. The next storage step would require a separate explicit approval for a controlled canonical-read feature flag or read-trial phase.

Recommended next path: pause storage migration and move to Phase 9 native slimming and deprecation audit, unless a controlled canonical-read feature flag phase is explicitly requested.
