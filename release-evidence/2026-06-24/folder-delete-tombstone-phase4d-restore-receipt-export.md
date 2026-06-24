# Phase 4D.1 - Desktop Folder Restore Receipt Export

## Purpose

Phase 4D.1 adds a Desktop-only, status-only restore receipt export for restored folder tombstones. The goal is to let Desktop publish that a folder was restored so Chrome can re-show it in a later phase. Chrome import/re-show is intentionally not implemented here.

## Design Summary

- Desktop remains the authority for folder delete/restore lifecycle.
- Restored folder tombstones are projected into `folderRestoreReceipts[]` during `latest.json` export.
- Receipts are status-only; they do not propagate tombstones or instruct Chrome to mutate state in this phase.
- Repeated export is idempotent because `receiptId` is derived from the restored tombstone id.

## Files Changed

- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs`
- `release-evidence/2026-06-24/folder-delete-tombstone-phase4d-restore-receipt-export.md`

## Exported Receipt Shape

Desktop exports a top-level:

```json
{
  "folderRestoreReceipts": []
}
```

Each projected receipt uses:

- `schema: "h2o.studio.folder-restore-receipt.v1"`
- `receiptId`
- `tombstoneId`
- `folderId`
- `folderName`
- `recordKind: "folder"`
- `status: "restored"`
- `decision: "desktop-folder-restored"`
- `restoredAt`
- `restoredBy` / `restoredBySurface`
- `restoredBySyncPeerIdPresent`
- `sourcePeerId: null`
- `statusOnly: true`
- `noTombstoneApply: true`
- `noHardDelete: true`
- `noChatDelete: true`
- `bindingRestoreAttemptedCount`
- `bindingRestoredCount`
- `bindingSkippedCount`
- `restoreWarnings`
- `chromeReShowDeferred: true`
- `tombstonePropagation: "deferred"`

Binding restore result counts are included where persisted metadata is available. The exporter can always derive attempted count from `recoverySnapshot.bindings[]`; restored/skipped counts remain `null` when the restored tombstone does not carry persisted per-restore result metadata. Raw Desktop sync peer ids are not exported; the receipt reports `restoredBy: "desktop-studio"` and `restoredBySyncPeerIdPresent`.

## Safety Guarantees

- No Chrome behavior changed in this phase.
- No Chrome folder re-show/hide mutation is implemented.
- No tombstone propagation is implemented.
- No hard delete or purge path is added.
- No chat rows are deleted.
- No snapshot rows are deleted.
- No raw SQL delete path is added.
- Receipt projection reads existing restored folder tombstones only.

## Deferred

- Chrome import of `folderRestoreReceipts[]`.
- Chrome visible-state re-show after validated restore receipt.
- Restore receipt runtime proof.
- Real tombstone propagation.
- Retention and purge.
- WebDAV/cloud/relay transport adapters.

## Validation

Commands:

```bash
node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js
node --check src-surfaces-base/studio/sync/folder-sync.tauri.js
node --check tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs
node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs
git diff --check
git diff --cached --check
```

Results:

- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js` passed.
- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js` passed.
- `node --check tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs` passed.
- `node tools/validation/sync/validate-folder-restore-receipt-phase4d.mjs` passed.
- `node tools/validation/sync/validate-folder-delete-request-phase4c.mjs` passed.
- `git diff --check` passed.
- `git diff --cached --check` passed.

## Runtime Proof Commands

Future live proof should use a Desktop-restored folder tombstone:

```js
await H2O.Studio.store.folders.restoreTombstonedFolder({
  tombstoneId: "<tombstone-id>"
});

await H2O.Studio.sync.folder.syncNow({
  direction: "desktop-to-chrome",
  reason: "phase4d-restore-receipt-export-proof"
});
```

Then inspect `/Users/hobayda/H2O Studio Sync/latest.json`:

```js
const receipt = latest.folderRestoreReceipts.find((row) =>
  row.tombstoneId === "<tombstone-id>" &&
  row.schema === "h2o.studio.folder-restore-receipt.v1"
);
```

Expected:

- `receipt.status === "restored"`
- `receipt.decision === "desktop-folder-restored"`
- `receipt.statusOnly === true`
- `receipt.noTombstoneApply === true`
- `receipt.noHardDelete === true`
- `receipt.noChatDelete === true`
- `receipt.chromeReShowDeferred === true`
- `receipt.tombstonePropagation === "deferred"`
