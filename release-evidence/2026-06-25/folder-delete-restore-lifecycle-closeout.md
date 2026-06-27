# Folder delete + restore lifecycle closeout

## Verdict

PASS / CLOSED. The folder delete + restore lifecycle is closed for Chrome Studio to Desktop Studio local RC parity.

This closeout combines the Phase 6B folder delete lifecycle and Phase 6C folder restore lifecycle. It does not close the full sync architecture.

## Evidence Referenced

- `release-evidence/2026-06-25/folder-delete-phase6b-closeout.md`
- `release-evidence/2026-06-25/folder-restore-phase6c-closeout.md`
- `release-evidence/2026-06-25/folder-restore-phase6c5-final-parity-audit.md`
- `release-evidence/2026-06-25/folder-restore-phase6c4-receipt-parity.md`
- `release-evidence/2026-06-25/folder-restore-phase6c3-desktop-restore-apply.md`
- `release-evidence/2026-06-25/folder-restore-phase6c2b-export-inflight-recovery.md`
- `release-evidence/2026-06-25/folder-restore-phase6c2-chrome-request-export.md`
- `release-evidence/2026-06-25/folder-restore-phase6c1-chrome-restore-ux.md`

## Delete Lifecycle Summary

Chrome folder delete is closed as a request-only soft-delete flow:

1. Chrome can request folder soft delete from the normal folder menu.
2. Chrome immediately removes the folder from the normal list as a local pending soft delete.
3. Chrome exports real `folderDeleteRequests[]`.
4. Desktop imports the delete request.
5. Desktop safely applies the soft delete.
6. Desktop creates the canonical active folder tombstone.
7. Desktop exports a trusted delete receipt.
8. Chrome imports the trusted Desktop delete receipt.
9. Chrome keeps the deleted folder hidden from the normal list.
10. Chrome Recently Deleted companion mirrors the Desktop canonical Recently Deleted projection.
11. Desktop permanent delete/purge suppression propagates to Chrome.
12. Chrome reload does not resurrect permanently deleted folders.

## Restore Lifecycle Summary

Chrome folder restore is closed as a request-only restore flow:

1. Chrome can request restore from the Recently Deleted companion.
2. Chrome exports a real `folderRestoreRequests[]` entry.
3. Desktop imports the restore request.
4. Desktop safely applies or recognizes the restore.
5. The folder becomes visible and canonical on Desktop.
6. Desktop Recently Deleted shows the target as restored history, not active deleted.
7. Desktop exports a trusted restore receipt.
8. Chrome imports the trusted Desktop restore receipt.
9. Chrome resolves the pending restore request.
10. Chrome Recently Deleted companion no longer shows the restored target as active deleted or restorable.
11. Phase 6C.5 prevents same-folder pending restore request resurrection after receipt import.

## Runtime Proof Anchors

Restore proof target:

- `folderId:"fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd"`
- `folderName:"chrome restore proof 1782569112247"`

Delete proof highlights from Phase 6B:

- Chrome creates/export real folder delete requests.
- Desktop imports and auto-applies safe Chrome soft-delete requests.
- Desktop exports trusted delete receipts.
- Chrome imports trusted Desktop receipts.
- `desktopChromeRecentlyDeletedParityOk:true`
- `extraChromeRows:[]`
- `missingChromeRows:[]`
- After purge/reload suppression:
  - `desktopCanonicalRecentlyDeletedCount:0`
  - `chromeCanonicalRecentlyDeletedCount:0`
  - `chromeCompanionRecentlyDeletedCount:0`
  - `resurrectedAfterPurgeCount:0`
  - `staleReceiptRowCount:0`
  - `blockers:[]`

Restore proof highlights from Phase 6C:

- Chrome restore export:
  - `restoreRequestCount:1`
  - `pendingRestoreRequestCount:1`
  - `blockers:[]`
- Desktop restore import/apply:
  - `folderRestoreRequestImport.found:1`
  - `folderRestoreRequestAutoApply.alreadyAppliedCount:1`
  - `desktopAppliedFolderRestoreRequestCount:1`
  - `blockers:[]`
- Desktop visible proof:
  - `status:"folder-visible"`
  - `visible:true`
  - `isCanonical:true`
  - `hidden:false`
  - `sourceKind:"desktop-store-visible"`
- Desktop Recently Deleted proof:
  - `targetActiveDeletedCount:0`
  - `targetRestoredHistoryCount:1`
  - `restoreStatus:"restored"`
- Desktop restore receipt export:
  - `folderRestoreReceiptExport.receiptCount:2`
  - `folderRestoreReceiptExport.requestReceiptCount:1`
  - `blockers:[]`
- Chrome restore receipt import:
  - `folderRestoreReceiptImport.receiptCount:2`
  - `folderRestoreReceiptImport.confirmedRestoreRequestCount:1` in 6C.4 proof
  - `folderRestoreReceiptImport.blockers:[]`
- Chrome final state in Phase 6C.5:
  - `pendingTargetRequestCount:0`
  - target request `status:"resolved"`
  - target request `decision:"applied-folder-restore-request"`
  - `targetCompanionCount:0`
  - `targetCompanionRows:[]`

## Authority Boundaries

- Chrome has no direct restore authority.
- Chrome has no tombstone apply/create authority.
- Chrome has no purge authority.
- Chrome has no permanent delete authority.
- No hard delete is introduced.
- No chat deletion is introduced.
- No snapshot deletion is introduced.
- No asset deletion is introduced.
- Restored history clear remains operator-controlled.
- Desktop remains the canonical delete, restore, Recently Deleted, and permanent-delete authority.
- Chrome remains request/status-only for delete/restore lifecycle behavior.

## Known Non-Blocking Noise

- Old delete request `already-tombstoned` aggregation noise can appear in wrapper-level diagnostics.
- Warning-only `restore-receipt-no-matching-request` can appear for fallback restore receipts with no matching local Chrome request.
- Opposite-direction health noise, such as `chrome-to-desktop-export-failed`, does not block lane-specific `desktop-to-chrome` receipt import when that lane reports `blockers:[]`.

## Scope Limitation

This closeout does not close the full sync architecture.

Remaining work outside this closeout includes:

- chat-folder binding sync
- labels/tags/categories sync
- broader product-level parity beyond folders
- any WebDAV/cloud/relay scope
- any additional restored-history UX or policy changes not already covered by the Desktop operator-controlled clear flow

## Closeout Validation

- `git diff --check`
- `git diff --cached --check`
