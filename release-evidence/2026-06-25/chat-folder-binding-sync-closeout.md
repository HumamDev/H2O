# Chat-Folder Binding Sync Closeout

Date: 2026-06-28

## Verdict

PASS / CLOSED. Chat-folder binding sync is closed end-to-end through B9 for Chrome Studio <-> Desktop Studio local RC parity.

Desktop remains the canonical authority for chat-folder bindings. Chrome remains request-only for binding mutations, and Chrome display parity uses the Desktop canonical binding projection.

This closeout does not close labels/tags/categories sync, broader library parity, WebDAV/cloud/relay scope, or full product-level sync architecture.

## Commit Chain

- Desktop-authority closeout: `817f360da185c183be46b147b6fcb5602a80ffdc`
- B8 implementation: `b20cf72` `feat(sync): export chrome chat folder binding requests`
- B8 runtime evidence: `0609ef4497aaf50541bfd192d45d857cf4143dc6`
- B9 implementation: `7398a3c5cdccad8ee76bd1468c25c617acb04bc4`
- B9 blocker fix: `c0fa208d5cd2dd5036e9a9e1493aeda3598bc810`
- B9 runtime evidence: `9991d7e778c2e3b5d497a21b81b462355915c55c`

## Evidence References

- `release-evidence/2026-06-25/chat-folder-binding-sync-audit-plan.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b1-diagnostics.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b2-desktop-export.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b3-chrome-import-parity.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b3a-diagnostic-runtime-fix.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b4-chrome-display-parity.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b5-desktop-origin-convergence.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b5a-canonical-move-persistence.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b5b-same-reader-persistence.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b5c-db-identity-persistence.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b5d-reverse-persistence.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b6-delete-fallback.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b7-restore-rebind.md`
- `release-evidence/2026-06-25/chat-folder-binding-desktop-authority-closeout.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b8-chrome-request-export.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b9-desktop-apply-receipt.md`

## Proven Slices

- B1 read-only diagnostics.
- B2 Desktop canonical chat-folder binding export.
- B3 Chrome import/read of the Desktop canonical binding projection.
- B4 Chrome display/read-model parity from the imported projection.
- B5 Desktop-origin binding move convergence, forward and reverse.
- B6 folder delete fallback / Unfiled behavior.
- B7 folder restore rebind from Desktop recovery metadata.
- B8 Chrome-origin binding request export.
- B9 Desktop apply + receipt for Chrome-origin binding requests.

## Lifecycle Summary

B1 through B4 established the read-only projection lane:

- Desktop reports canonical binding counts and Unfiled count safely.
- Desktop exports `desktopCanonicalChatFolderBindings` / `chatFolderBindings`.
- Chrome imports the Desktop canonical projection.
- Chrome display/read-model parity reaches `parityOk:true`.
- Chrome gains no destructive binding authority.

B5 proved Desktop-origin convergence:

- Desktop-only, smoke-gated binding move path writes the canonical SQLite `folder_bindings` store.
- Forward move Code -> English converged to Chrome parity.
- Reverse move English -> Code restored the original state.
- Chrome remained read-only.

B6 proved delete fallback:

- Soft-deleting a folder with bound chats did not delete chats, snapshots, or assets.
- Deleted-folder bindings were excluded from the active canonical projection.
- Affected chats fell back to Unfiled / recovery state.
- Chrome imported the resulting Desktop projection with parity green.

B7 proved restore rebind:

- Restoring the soft-deleted Tech folder restored prior bindings from Desktop recovery metadata.
- `bindingRestoreAttemptedCount:2`
- `bindingRestoredCount:2`
- `bindingSkippedCount:0`
- Tech active binding count returned to `2`.
- Chrome imported/displayed parity with `parityOk:true`.

B8 proved Chrome-origin request export:

- Chrome can create request-only `chatFolderBindingRequests[]`.
- Exported request payload contains chat identity, expected current folder, target folder, request id, Chrome source, and safety flags.
- Desktop canonical binding counts remained unchanged after Chrome request/export.
- Chrome remained request-only.

B9 proved Desktop apply + receipt:

- Desktop imports Chrome-origin binding requests.
- Desktop validates and applies through Desktop canonical authority.
- Desktop exports updated projection and `chatFolderBindingReceipts[]`.
- Chrome imports Desktop projection/receipt and reaches parity.
- Pending Chrome request count returns to `0`.

## Final B9 Runtime Result

Request:

- requestId: `chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52`
- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- expectedCurrentFolderId: `f_e301f3506938c19dbac0e304`
- targetFolderId: `f_2bb1037f88b2719dbac10c22`

Desktop apply:

- Desktop applied request: `true`
- old folder-delete rows idempotent/non-fatal: `true`
- Code `f_e301f3506938c19dbac0e304` count: `0`
- English `f_2bb1037f88b2719dbac10c22` count: `1`
- Tech `f_3bf15f43b835d19dbac0fb13` count: `2`
- totalBindingCount: `12`
- knownChatCount: `41`
- unfiledCount: `29`
- blockers: `[]`

Chrome final state:

- Chrome health: `healthy`
- Chrome lastImportStatus: `sync-folder-imported`
- Chrome parityOk: `true`
- importedCount: `12`
- chromeCount: `12`
- Code count: `0`
- English count: `1`
- Tech count: `2`
- pendingRequests: `0`
- blockers: `[]`
- warnings: `[]`

## Safety Boundaries

- noChromeDestructiveBindingApply: `true`
- noDesktopCanonicalMutation from Chrome direct write.
- noHardDelete: `true`
- noPurge: `true`
- noChatDelete: `true`
- noSnapshotDelete: `true`
- noAssetDelete: `true`

Chrome-origin binding changes are request/receipt based. Desktop remains the only canonical binding writer in the closed lifecycle.

## Non-Blocking Notes

- Existing missing/dangling binding metadata remains tracked separately and does not block parity.
- Older stale folder-delete rows are now idempotent/non-fatal for unrelated request lanes.
- Chrome request list projection had a non-blocking display quirk in B8, but the exported canonical request payload was correct.

## Remaining Work

- Labels/tags/categories sync.
- Broader library parity.
- Full product-level sync architecture closeout.

Do not reopen chat-folder binding sync unless a regression appears.
