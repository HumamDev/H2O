# Operational.5 - Dangling Binding Cleanup Design Preflight

Verdict: **OPERATIONAL.5 DANGLING BINDING CLEANUP DESIGN PREFLIGHT READY**.

This is a design/preflight slice only. No product source was edited, no live cleanup was run, no
folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror state was mutated,
`productSyncReady` remained `false`, WebDAV/cloud/relay/`fullBundle.v3` was not started, and Chat
Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Inputs

- Dangling cleanup preflight: `584aff71ce3f40d45cc1b51ea38fe98813c6f093`.
- Dangling row-level diagnostic prep: `aa2526b8f35de7ff5c8b697935b870f80a57af52`.
- Live row-level diagnostic:
  - schema: `h2o.studio.operational5.dangling-binding-row-level-diagnostic.v1`
  - `canonicalFolders:6`
  - `rawCanonicalBindings:14`
  - `exportableCanonicalBindings:12`
  - `danglingBindings:2`
  - `tombstonesObserved:20`
  - `receiptsObserved:1`
  - `rawCanonicalBindingHash:"sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e"`
  - `recomputedCanonicalBindingHash:"sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e"`
  - `exportableBindingHash:"sha256:3d3ee859083fcce5f079bee68a415db52648423297523662c8e53f165cf97ee0"`
  - `danglingRowsHash:"sha256:7ca03b2f8d5c48a32924ae07849eeee3843631c14d3f725cc870f9f83cfca3e2"`
  - `tombstoneOrReceiptExplained:2`
  - `unsafeManualReview:0`
  - `nextRecommendation:"Cleanup implementation may be designed next, using reviewed non-destructive path only; no direct delete."`

Raw chat ids, raw folder ids, raw chat titles/content, and raw folder names are not recorded in this
evidence. The row tokens below are the only row identifiers recorded.

## Row-Level Classification

| Row token | Chat live | Folder tombstone likely | FolderBinding tombstone likely | Reviewed receipt likely | Classification |
| --- | --- | --- | --- | --- | --- |
| `row:a950a44b859f` | `false` | `true` | `true` | `false` | `tombstone/receipt explained` |
| `row:fdd2456fc8a2` | `true` | `true` | `true` | `false` | `tombstone/receipt explained` |

Both dangling rows are explained by tombstone context. No row is classified as `unsafe-needs-manual-review`,
and no row is classified as a restore-folder candidate or reviewed rebind candidate in this slice.

## Existing Source Capabilities

The current source has these relevant capabilities:

- `src-surfaces-base/studio/store/folders.tauri.js`
  - canonical binding readers:
    - `listCanonicalChatFolderBindings()`
    - `listCanonicalChatFolderBindingsForChat(chatIdInput)`
  - binding writers:
    - `bindChat(...)`
    - `unbindChat(...)`
    - `materializeSettledCanonicalChatFolderBinding(...)`
  - folderBinding tombstone helpers:
    - `buildFolderBindingTombstone(...)`
    - `writeFolderBindingTombstoneSafely(...)`
  - recently deleted/recovery context:
    - `listRecentlyDeletedFolders(opts)`
- `src-surfaces-base/studio/store/tombstones.tauri.js`
  - `folderBinding` tombstone kind support
  - `listTombstones(filters)`
  - `createTombstone(record)`
- `src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
  - reviewed `folderBinding` receipt/request support
  - `listChatFolderBindingReceipts(filters)`
  - `previewApply(reviewId, options)`
  - `applyRealFolderBindingReview(...)`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
  - reviewed binding request schema:
    `h2o.studio.chat-folder-binding-request.v1`
  - reviewed binding receipt schema:
    `h2o.studio.chat-folder-binding-receipt.v1`
  - apply gate:
    `folder-sync-chat-folder-binding-repair-apply`
  - hash gate:
    `post-apply-binding-hash-mismatch`

These capabilities are not sufficient to approve a blind cleanup. The existing reviewed tombstone
apply path is designed for reviewed remote tombstone application, while this Operational.5 debt is a
local source-of-truth reconciliation case where the dangling raw canonical rows are already explained
by tombstone context. A narrow cleanup command still needs its own reviewed request/receipt contract.

## Cleanup Options Considered

1. **Reviewed tombstone-backed delete of only the dangling binding rows**
   - Best fit for the live facts.
   - Must not be a bare SQL delete.
   - Must require exact raw canonical row match, matching folder tombstone, matching folderBinding
     tombstone, no canonical folder row for the missing folder, and no exportable binding removal.
   - Must emit a cleanup receipt and preserve existing tombstone evidence.

2. **Reviewed unbind-to-Unfiled through F15 for the live-chat row**
   - Not recommended as the primary path for this debt.
   - The row is already dangling and tombstone-explained; routing it as a user-intent rebind/unbind
     could confuse source-of-truth cleanup with a semantic chat move.
   - May remain a fallback design only if the future cleanup review rejects a dedicated orphan cleanup
     command.

3. **No-op for the non-live-chat row plus tombstone evidence**
   - Not sufficient for Operational.5 readiness because raw canonical count would remain `14` while
     exportable count remains `12`.
   - Useful as evidence context, not as readiness resolution.

4. **Restore missing folders from recovery snapshots**
   - Not recommended for these two rows based on the row-level classification.
   - Both rows are tombstone/receipt explained, not restore-folder candidates.
   - A restore path would risk resurrecting deleted folder state solely to satisfy raw-count parity.

5. **Tombstone the dangling binding**
   - A tombstone likely already exists for both rows.
   - Future cleanup should verify the existing tombstone and create no duplicate tombstone unless the
     exact current tombstone context is missing or malformed.

6. **Delete dangling row only after tombstone receipt**
   - Recommended direction, with the important qualifier that the deletion must be wrapped by a
     dedicated reviewed cleanup command and receipt.
   - The receipt must prove no folder/chat/tombstone destructive action occurred and that only the two
     exact tombstone-explained dangling `folder_bindings` rows were removed.

## Recommended Cleanup Implementation Path

Implement a dedicated **Operational.5 reviewed orphan-binding cleanup command** in a later slice.

Minimum future command contract:

1. Dry-run first.
2. Accept only redacted/live-derived row tokens plus internally re-read exact raw ids from canonical
   SQLite; do not trust caller-supplied raw ids alone.
3. Re-read current canonical folders and raw `folder_bindings`.
4. Select only rows whose folder id is absent from canonical folders and whose row token matches the
   previously diagnosed dangling row set.
5. For each selected row, require:
   - matching raw canonical `folder_bindings` row still exists;
   - missing folder still absent from canonical folders;
   - folder tombstone context exists;
   - folderBinding tombstone context exists;
   - no row is exportable in `fullBundle.v2`;
   - no `unsafeManualReview` classification;
   - no raw names/titles/content are logged.
6. For `chatLive:false` row `row:a950a44b859f`:
   - cleanup action: remove only the dangling binding row after verifying tombstone explanation;
   - do not restore the folder;
   - do not rebind to Unfiled;
   - do not mutate chat state.
7. For `chatLive:true` row `row:fdd2456fc8a2`:
   - cleanup action: remove only the dangling binding row after verifying tombstone explanation;
   - leave the chat unfiled unless a separate reviewed user-intent rebind request exists;
   - do not fabricate a new Unfiled binding;
   - do not restore the missing folder.
8. Apply only with a new explicit Operational.5 cleanup gate and a cleanup receipt.
9. On apply, write only the minimal `DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?`
   for rows that passed the exact tombstone-backed verification.
10. Do not delete folders, chats, tombstones, ledgers, receipts, render mirror, import/export state,
    or restart convergence records.

Suggested future cleanup receipt fields:

- `schema:"h2o.studio.operational5.dangling-binding-cleanup-receipt.v1"`
- `status:"dry-run"` or `status:"applied"`
- `reason:"dangling-binding-tombstone-explained-cleanup"`
- `rawCanonicalBindingCountBefore:14`
- `rawCanonicalBindingCountAfter:12`
- `exportableCanonicalBindingCountBefore:12`
- `exportableCanonicalBindingCountAfter:12`
- `fullBundleV2BindingProjectionCountBefore:12`
- `fullBundleV2BindingProjectionCountAfter:12`
- `removedDanglingBindingCount:2`
- `folderDeleteCount:0`
- `chatDeleteCount:0`
- `tombstoneDeleteCount:0`
- `receiptDeleteCount:0`
- `renderMirrorWriteCount:0`
- `productSyncReady:false`

## Required Future Proof

Before cleanup can be accepted:

1. Cleanup dry-run proof:
   - identifies exactly the two row tokens;
   - proves both rows remain tombstone-explained;
   - write counts are zero.
2. Controlled cleanup apply proof:
   - uses the explicit cleanup gate;
   - removes only the two verified dangling raw canonical binding rows;
   - creates or updates only the cleanup receipt if required;
   - no folder/chat/tombstone/delete/purge/import/export/render-mirror mutation.
3. Post-cleanup parity proof:
   - raw canonical `folder_bindings` count drops from `14` to `12`;
   - exportable canonical bindings remains `12`;
   - `fullBundle.v2` binding projection remains `12`;
   - no valid/exportable binding was removed;
   - tombstone context remains intact.
4. Restart/readback proof:
   - raw count remains `12` after restart or equivalent durable readback;
   - duplicate cleanup replay is zero-write/no-op.
5. Product readiness remains a separate decision:
   - `productSyncReady:false` until a later explicit readiness review.

## Boundaries Held

- Design/preflight only.
- No product source edited.
- No cleanup/write/apply/delete/restore/rebind/unbind/purge.
- No folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror mutation.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback added.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and render-mirror no-write boundary were not weakened.

## Next Step

Cleanup implementation is **not approved by this slice**. The next slice should be an explicit
implementation prompt for the dedicated reviewed Operational.5 orphan-binding cleanup command, followed
by dry-run proof before any controlled apply.
