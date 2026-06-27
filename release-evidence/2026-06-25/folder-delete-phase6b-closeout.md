# Phase 6B Closeout — Chrome folder delete lifecycle

## Verdict

Phase 6B is closed for local RC folder delete lifecycle behavior:

- Chrome soft-delete UX is implemented.
- Chrome creates/export real folder delete requests.
- Desktop imports and safely auto-applies Chrome soft-delete requests.
- Desktop exports trusted delete receipts.
- Chrome imports trusted Desktop receipts.
- Chrome and Desktop Recently Deleted canonical views are parity-matched after sync.
- Desktop permanent delete/purge suppression propagates to Chrome.
- Chrome reload no longer resurrects permanently deleted folders.

This closeout covers Phase 6B only. It does not close broader product sync, WebDAV/cloud/relay, labels/tags/categories sync, chat-folder binding sync, or Chrome restore request parity.

## Closed Commit Chain

- `db6b53b` — 6B.1 Chrome soft delete menu UX.
- `60676de` — 6B.2 simplified Chrome delete UX.
- `6b26cf8` — 6B.3 Chrome Recently Deleted companion and local pending hide.
- `4fcf493` — 6B.3a companion state merge/audit.
- `a94a0a5` — 6B.3a runtime evidence.
- `9af5cba` — 6B.4 Desktop auto-apply Chrome soft delete.
- `7c2a0ae` — 6B.4 partial/runtime blocker evidence.
- `8aa6fba` — 6B.4 runtime recovery evidence.
- `8e708661eeb12f93e0fddf8602a8c72b0f22f816` — 6B.4c Chrome real request export repair.
- `bb9e76e5d9dfbab7dbe714f2d317fc5f9b44680a` — 6B.4d Chrome export gate fix.
- `7a06c0f5fff6b5a82b96477f00817fd016dcaaef` — 6B.4e Chrome trusted Desktop receipt import.
- `b806bc94c8b6623c4410a1042eef98f6daea0c78` — 6B.4e runtime evidence.
- `4de152495da4189528a492077e707f0f1ecb6242` — 6B.5 Recently Deleted canonical parity.
- `c864548d00aa2ddd907dd282eafc0a74a88010d9` — 6B.5b runtime parity fix.
- `3d5ccd12fa7f18c1a70d626a737c8675c41558c2` — 6B.6 purge/reload resurrection suppression.
- `3604acf2aa22688fe9c1fb0acaafc28ed5bc8edb` — 6B.6 runtime evidence.

## Final Product Behavior

1. Chrome Delete creates a real soft-delete request.
2. Chrome immediately hides the deleted folder from the normal list.
3. Chrome exports real `folderDeleteRequests[]`.
4. Desktop imports the request.
5. Desktop auto-applies safe Chrome soft-delete.
6. Desktop creates the canonical active tombstone.
7. Desktop exports a delete receipt.
8. Chrome imports the trusted Desktop receipt.
9. Chrome Recently Deleted companion shows Desktop-confirmed deleted rows.
10. Desktop canonical Recently Deleted and Chrome Recently Deleted are parity-matched.
11. Desktop permanent delete/purge suppression propagates to Chrome.
12. Chrome reload does not resurrect permanently deleted folders.
13. Chrome sidebar no longer shows a separate `Recently Deleted · N` row.
14. Chrome restore and permanent delete remain Desktop-only/read-only.
15. Chrome has no purge authority.
16. Chrome has no tombstone apply/create authority.
17. No hard delete is introduced.
18. No chat, snapshot, or asset deletion is introduced.

## Runtime Proof Highlights

### Phase 6B.5b

- Desktop canonical Recently Deleted count: `3`
- Chrome canonical Recently Deleted count: `3`
- Chrome companion count: `3`
- `desktopChromeRecentlyDeletedParityOk:true`
- `extraChromeRows:[]`
- `missingChromeRows:[]`
- stale receipt rows are diagnostic-only, not active Recently Deleted rows

### Phase 6B.6

- Desktop export:
  - `status:"latest-sync-bundle-written"`
  - `bytes:686062`
- Chrome import:
  - `status:"sync-folder-imported"`
- After Chrome reload:
  - `desktopChromeRecentlyDeletedParityOk:true`
  - `desktopCanonicalRecentlyDeletedCount:0`
  - `chromeCanonicalRecentlyDeletedCount:0`
  - `chromeCompanionRecentlyDeletedCount:0`
  - `resurrectedAfterPurgeCount:0`
  - `staleReceiptRowCount:0`
  - `extraChromeRows:[]`
  - `missingChromeRows:[]`
  - `blockers:[]`
  - `warnings:[]`

## Safety Invariants

- no Chrome purge authority
- no Chrome permanent delete authority
- no Chrome restore authority
- no Chrome tombstone apply/create
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- Desktop remains the canonical delete/restore/permanent-delete authority
- Chrome remains a light companion/status surface

## Deferred Outside Phase 6B

- Restore request parity from Chrome is not implemented unless separately scoped.
- WebDAV/cloud/relay is deferred.
- Labels/tags/categories sync is deferred.
- Chat-folder binding sync is deferred.
- Full product sync is not globally closed; only the Phase 6B folder delete lifecycle is closed.

## Closeout Validation

- `git diff --check`
- `git diff --cached --check`
