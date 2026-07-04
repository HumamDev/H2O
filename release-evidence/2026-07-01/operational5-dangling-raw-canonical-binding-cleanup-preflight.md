# Operational.5 - Dangling Raw Canonical Binding Cleanup Preflight

Verdict: **OPERATIONAL.5 DANGLING RAW CANONICAL BINDING CLEANUP PREFLIGHT REQUIRED**.

This is a read-only cleanup/reconciliation debt preflight for the two raw canonical
`folder_bindings` rows that are filtered out of the `fullBundle.v2` exportable binding projection.
No product source was edited, no live cleanup was run, no folders/chats/bindings/tombstones/ledgers
were mutated, `productSyncReady` remained `false`, WebDAV/cloud/relay/`fullBundle.v3` was not
started, and Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Inputs

- Operational.5 readiness decision after live parity:
  `13ca3677c3815c9bc098d705ddfddf3d9884d2d1`.
- `fullBundle.v2` binding count mismatch investigation:
  `640e6f3d2a365b53a50712d0dfa683463ef4ce0e`.
- Live Operational.5 diagnostic v3:
  - schema: `h2o.studio.operational5.live-readonly-canonical-count-parity-diagnostic.v3`
  - `classification.overall:"match-with-known-debt"`
  - `mismatches:[]`
  - `orphanBuckets:[]`
  - `notExposed:[]`
  - `requiresLiveFollowUp:[]`
  - `knownDebt:["rawCanonicalDanglingBindingsFilteredFromExport"]`
  - Desktop raw canonical `folder_bindings` count: `14`
  - exportable canonical binding subset count: `12`
  - `fullBundle.v2` binding projection count: `12`
  - `fullBundleV2BindingsVsExportableCanonical:"match"`
  - `fullBundleV2RawBindingsDebtRecorded:"known-debt-recorded"`
  - no writes attempted
  - no fallback

## What The Two Rows Are

The two rows are classified as **raw canonical dangling chat-folder binding rows**:

- each row exists in Desktop SQLite `folder_bindings`;
- each row has a canonical chat id and folder id;
- each row is included in the raw canonical binding count of `14`;
- each row is excluded from the exportable canonical binding subset of `12`;
- each row is counted through the `fullBundle.v2` missing-folder branch as:
  - `missingFolderBindingCount:2`,
  - `fallbackUnfiledBindingCount:2`,
  - `activeDanglingFolderBindingCount:2`;
- the prior diagnostic classified `deletedFolderBindingCount:0`, so these rows were not classified
  as active-deleted-folder bindings by the `fullBundle.v2` active tombstone scan.

Raw chat ids, raw folder ids, chat titles, and folder names are not recorded in this evidence. The
live v3 output supplied to this slice was aggregate-level and did not include redacted per-row tokens.
Therefore this preflight identifies the exact two-row bucket, not raw row identifiers.

## Source Classification

`src-surfaces-base/studio/ingestion/export-bundle.tauri.js` builds the
`fullBundle.v2` canonical chat-folder binding projection by reading
`store.folders.listCanonicalChatFolderBindings()`, then comparing each `folder_id` to the current
canonical folder id set.

For a canonical binding row whose `folder_id` is missing from the canonical folder set, the projection:

- increments `missingFolderBindingCount`;
- increments `fallbackUnfiledBindingCount`;
- increments `activeDanglingFolderBindingCount`;
- returns before `bindings.push(...)`;
- therefore filters the row from the active/exportable projection.

That behavior is intentional export filtering, not an export bug. It keeps unsafe dangling bindings out
of `fullBundle.v2` while preserving the raw canonical debt in diagnostics.

## Read-Only Context Checked

Existing read-only context surfaces are present:

- `H2O.Studio.store.folders.getAll()` / `count()` for canonical folders.
- `H2O.Studio.store.folders.listCanonicalChatFolderBindings()` for raw canonical binding rows.
- `H2O.Studio.store.folders.listCanonicalChatFolderBindingsForChat(chatId)` for per-chat binding
  readback.
- `H2O.Studio.store.folders.listChats(folderId)` for folder-scoped chat readback.
- `H2O.Studio.store.folders.listRecentlyDeletedFolders({ limit })` for folder tombstone/recovery
  context.
- `H2O.Studio.store.tombstones.list({ recordKind:"folder", includeRestored:true })` for folder
  tombstone rows.
- `H2O.Studio.store.tombstones.list({ recordKind:"folderBinding", includeRestored:true })` for
  folderBinding tombstone context.
- `H2O.Studio.store.tombstoneReviews.listChatFolderBindingReceipts({ limit })` for reviewed binding
  receipt context.

The current live aggregate output is insufficient to answer, per row, whether the associated chats
are still live, whether exact folder tombstones/recovery snapshots exist, or whether exact
folderBinding tombstones already represent the rows. That must be checked by the next read-only live
row-level diagnostic with hash/redacted tokens only.

## Cleanup Decision

The rows are **not approved cleanup candidates yet**.

Do not delete the two `folder_bindings` rows solely because they are dangling. The safe path depends on
per-row context:

1. If the missing folder has an active/restorable folder tombstone with recovery snapshot and the chat
   is still live, prefer a reviewed folder restore/reconciliation path.
2. If the folder is not restorable but the chat is live, prefer the reviewed F15-settled binding repair
   path to move/rebind/unbind against a valid target, with dry-run, controlled apply, restart survival,
   and duplicate replay proof.
3. If the chat is not live or the binding is already represented by a folderBinding tombstone/receipt,
   design a dedicated reviewed orphan-binding cleanup handler. That handler must dry-run first, create
   or verify the correct folderBinding tombstone/receipt evidence, and only then remove or mark the raw
   row if explicitly approved.
4. Do not reclassify these rows as exportable just to satisfy parity.
5. Do not mark `productSyncReady` true while this source-of-truth cleanup debt remains.

## Required Next Proof

Before cleanup implementation or final productSyncReady review, run a read-only row-level diagnostic
that returns:

- redacted row token for each dangling row;
- redacted chat token and liveness status;
- redacted missing folder token;
- whether the missing folder appears in canonical folders, active folder tombstones, restored folder
  tombstones, recovery snapshots, render mirror, or `fullBundle.v2` projection diagnostics;
- whether a folderBinding tombstone or reviewed binding receipt already represents the edge;
- recommended per-row action: restore-folder, reviewed-rebind, reviewed-unbind, orphan-cleanup-design,
  or blocked-insufficient-context;
- no raw names, raw ids, chat titles, or content.

## Boundaries Held

- Read-only only.
- No product source edited.
- No folder/chat/binding/tombstone/ledger/receipt mutation.
- No delete, purge, hard-delete, restore, rebind, unbind, or apply.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback added.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and render-mirror no-write boundary were not weakened.

## Recommended Next Step

Prepare and run the read-only row-level dangling binding diagnostic described above. Cleanup
implementation should happen only after that diagnostic classifies each of the two rows and a reviewed
non-destructive-first cleanup plan is approved.
