# Phase 6C Closeout - Chrome/Desktop folder restore lifecycle

## Verdict

PASS / CLOSED. Phase 6C folder restore lifecycle is closed for the local RC folder sync path.

Chrome can request a folder restore, Desktop remains the canonical restore authority, and Chrome resolves its pending restore state only after trusted Desktop restore receipt import. This closeout covers Phase 6C only. It does not close the full sync architecture.

## Closed Commit Chain

- `6b6ec623e1c66a49bb9f8954f936880491c1529a` - 6C plan.
- `448de2b0fa011f42de8103ced21c6efb6a77ba76` - 6C.1 Chrome restore UX.
- `47f1cc81da11662791c3f51d194ef368f95cd605` - 6C.2 Chrome restore request export.
- `e9d6b64fe144ba917aa93c1c4379c35a76a8aca7` - 6C.2b Chrome restore export in-flight recovery.
- `0dcd39898741c9144d4dc26aca908f19e99a1975` - 6C.3 Desktop restore request import/apply.
- `b7800e5fe7e5112880fcb451d28a1d26e149bb04` - 6C.2b/6C.3 runtime evidence.
- `5c043abd53a4b6645befd0d4e73b246ef1388f3b` - 6C.4 Desktop restore receipt export and Chrome import.
- `8cd742fbe7f2eccd76676916ce09f7bdb62c2bea` - 6C.4 runtime evidence.
- `e1f81b748bd5dfecc28aa3fd48300bc03cf2bcc0` - 6C.5 same-folder pending restore reconciliation fix.
- `9d5069a6406262e3d5bdcfde539ad0cc9ab770a7` - 6C.5 runtime evidence.

## Evidence Chain

- `release-evidence/2026-06-25/folder-restore-phase6c-plan.md`
- `release-evidence/2026-06-25/folder-restore-phase6c1-chrome-restore-ux.md`
- `release-evidence/2026-06-25/folder-restore-phase6c2-chrome-request-export.md`
- `release-evidence/2026-06-25/folder-restore-phase6c2b-export-inflight-recovery.md`
- `release-evidence/2026-06-25/folder-restore-phase6c3-desktop-restore-apply.md`
- `release-evidence/2026-06-25/folder-restore-phase6c4-receipt-parity.md`
- `release-evidence/2026-06-25/folder-restore-phase6c5-final-parity-audit.md`

## End-to-End Behavior Proven

1. Chrome Recently Deleted companion shows request-only restore UX.
2. Chrome creates a real folder restore request.
3. Chrome exports `folderRestoreRequests[]` to Desktop.
4. Desktop imports the restore request.
5. Desktop safely applies or recognizes the restore.
6. The restored folder becomes visible and canonical on Desktop.
7. Desktop Recently Deleted target becomes restored history, not active deleted.
8. Desktop exports a trusted restore receipt.
9. Chrome imports the trusted Desktop restore receipt.
10. Chrome pending restore request becomes resolved.
11. Chrome Recently Deleted companion no longer shows the target as active deleted or restorable.
12. Phase 6C.5 prevents same-folder pending restore request resurrection after receipt import.

## Runtime Proof Target

- `folderId:"fold_smoke_chrome-restore-proof-1782569112247_mqwfmhu8_8d8f2f42d3fd"`
- `folderName:"chrome restore proof 1782569112247"`

## Runtime Assertions

Chrome restore request export:

- `restoreRequestCount:1`
- `pendingRestoreRequestCount:1`
- `blockers:[]`

Desktop restore request import/apply:

- `folderRestoreRequestImport.found:1`
- `folderRestoreRequestAutoApply.alreadyAppliedCount:1`
- `desktopAppliedFolderRestoreRequestCount:1`
- `blockers:[]`

Desktop visible proof:

- `status:"folder-visible"`
- `visible:true`
- `isCanonical:true`
- `hidden:false`
- `sourceKind:"desktop-store-visible"`

Desktop Recently Deleted proof:

- `targetActiveDeletedCount:0`
- `targetRestoredHistoryCount:1`
- `restoreStatus:"restored"`
- `restoreAvailable:false`
- `restoreAvailableReason:"already-restored"`

Desktop restore receipt export:

- `folderRestoreReceiptExport.receiptCount:2`
- `folderRestoreReceiptExport.requestReceiptCount:1`
- `blockers:[]`

Chrome restore receipt import:

- `folderRestoreReceiptImport.receiptCount:2`
- `folderRestoreReceiptImport.confirmedRestoreRequestCount:1` in 6C.4 proof
- `folderRestoreReceiptImport.blockers:[]`

Chrome final state in 6C.5:

- `pendingTargetRequestCount:0`
- target request `status:"resolved"`
- target request `decision:"applied-folder-restore-request"`
- `targetCompanionCount:0`
- `targetCompanionRows:[]`
- `blockers:[]`

## Safety Boundaries

- no Chrome direct restore authority
- no Chrome tombstone apply/create
- no Chrome purge authority
- no Chrome permanent delete authority
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- restored history clear remains operator-controlled
- Desktop remains the restore authority
- Chrome remains request/status-only for restore

## Known Non-Blocking Noise

- Old delete-lane `already-tombstoned` aggregation noise can appear in wrapper-level diagnostics, but it did not block restore import/apply.
- Warning-only `restore-receipt-no-matching-request` entries can appear for tombstone fallback receipts with no matching local Chrome request.
- Opposite-direction `chrome-to-desktop-export-failed` health noise does not block the green `desktop-to-chrome` restore receipt import lane.

## Deferred Outside Phase 6C

- Restored-history clear UX/policy can be revisited separately if desired.
- Broader folder delete/restore RC closeout may be documented separately.
- Chat-folder binding sync is deferred.
- Labels/tags/categories sync is deferred.
- Full product-level sync parity beyond folders is deferred.

## Explicit Scope Statement

Phase 6C closeout does not mean the full sync architecture is complete. It closes only the folder restore lifecycle across Chrome Studio and Desktop Studio under the current local RC sync model.

## Closeout Validation

- `git diff --check`
- `git diff --cached --check`
