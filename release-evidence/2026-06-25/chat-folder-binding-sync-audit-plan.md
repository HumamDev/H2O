# Chat-folder binding sync audit and plan

## Verdict

PARTIAL. Desktop has real chat-folder binding storage and safe local delete/restore binding mechanics, but Chrome Studio to Desktop Studio binding parity is not closed.

The current local RC folder delete/restore closeout intentionally excludes full chat-folder binding sync. Existing code can capture, unbind, and restore Desktop bindings during Desktop-owned folder delete/restore, and some older bundle/import paths can carry folder membership hints. The active Chrome/Desktop folder sync lane still treats chat-folder bindings as deferred or one-way/partial, so chat assignment, move, unfile, delete fallback, and restore rebind parity require a new scoped phase.

## Files Inspected

- `src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js`
- `src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js`
- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/library/library-folder-binding-bridge-diagnostic.tauri.js`
- `src-surfaces-base/studio/sync/library/library-binding-canonicalizer.tauri.js`
- `src-surfaces-base/studio/sync/library/library-binding-preflight.tauri.js`
- `src-surfaces-base/studio/sync/library/library-binding-apply-event-receipt.tauri.js`
- `src-surfaces-base/studio/sync/execute/adapters/library-binding-execute-adapter.tauri.js`
- `tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs`
- `tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `tools/validation/sync/validate-f19-live-parity-proof.mjs`
- `release-evidence/2026-06-25/folder-delete-restore-lifecycle-closeout.md`
- `release-evidence/2026-06-25/folder-restore-phase6c-closeout.md`

## Current Architecture Map

### Binding Storage

- Desktop source-of-truth is SQLite `folder_bindings`, surfaced by `src-surfaces-base/studio/store/folders.tauri.js`.
- The V1 cardinality is one folder per chat. The comments and store behavior state that `folder_bindings` has `PRIMARY KEY (chat_id)`, and `bindChat` uses `INSERT OR REPLACE` semantics so moving a chat between folders replaces the prior binding.
- Desktop store APIs:
  - `bindChat(folderId, chatId, opts)`
  - `unbindChat(folderId, chatId, opts)`
  - `listChats(folderId)`
  - `listForChat(chatId)`
- Unfiled is represented by absence of a `folder_bindings` row for a chat, not by binding to a normal folder row. The UI/system row named Unfiled must remain protected and must not be treated as a mutable user folder.

### Binding Mutation Paths

- Public Studio actions are in `S0F3b. 🎬 Folders Actions - Studio.js`:
  - `bindChat(chatId, folderId)` validates the folder, then delegates to `store.folders.bindChat(folderId, chatId, ...)`.
  - `unbindChat(chatId)` resolves the current folder with `listForChat(chatId)`, then calls `store.folders.unbindChat(...)`.
  - `remove(folderId)` routes to Desktop local soft delete and reports `bindingUnboundCount` and related counts.
  - `restore(folderIdOrTombstoneId)` routes to Desktop restore and reports `bindingRestoreAttemptedCount`, `bindingRestoredCount`, and `bindingSkippedCount`.
- The older UI-facing binding entry point remains `desktopSetFolderBinding(chatId, folderId, opts)` in `S0F1b. 🎬 Library Workspace - Studio.js`. It now prefers `H2O.Studio.actions.folders.bindChat/unbindChat` and emits the existing `folder-binding-changed` event.
- Chrome can call `chatList.setFolderBinding(...)` through the Library Workspace path, but the current audited folder delete/restore request/receipt lane does not yet define a Chrome request/receipt contract for binding mutation authority.

### Folder Delete With Bound Chats

- `folders.tauri.js` has the existing helpers called out in prior design:
  - `readFolderBindingsForRemoveSafely(folderId)`
  - `buildFolderBindingTombstone(folderId, chatId, opts)`
  - `writeFolderRemoveTombstonesSafely(folderId, folder, bindings, bindingsReadOk)`
- `softDeleteEmptyFolder(folderId, opts)` is no longer empty-only in practice. It reads bindings, captures them in `buildFolderRecoverySnapshot(...)`, creates a folder tombstone with the recovery snapshot, then calls `unbindSnapshotBindingsForSoftDelete(...)`.
- `unbindSnapshotBindingsForSoftDelete(...)` calls `unbindChat(...)` for each captured chat with `noChatDelete:true`, which moves affected chats to Unfiled by removing their binding rows. It does not delete chats or snapshots.

### Folder Restore With Prior Bindings

- `restoreTombstonedFolder(...)` restores folder metadata from the recovery snapshot and calls `restoreBindingsFromRecoverySnapshot(...)`.
- `restoreBindingsFromRecoverySnapshot(...)` rebinds only eligible chats:
  - skips missing chats,
  - skips chats currently rebound to another folder,
  - treats already-bound-to-target as restored,
  - calls `bindChat(...)` with `allowTombstonedFolderRebind:true` only through the Desktop restore path.
- This local Desktop behavior is strong reuse material for a future restore-rebind proof, but it is not yet a Chrome/Desktop binding parity contract.

### Transport Coverage

- `export-bundle.tauri.js` can build `folderState.items` from `store.folders.listChats(folderId)` in `buildFolderState(...)`.
- `export-bundle.tauri.js` also computes folder parity diagnostics with `bindingCount`, `chatIndexFolderReferences`, and `chatArchiveFolderReferences`.
- `import-bundle.tauri.js` has `importFolderBindings(...)`, which reads `chromeStorageLocal[FOLDER_STATE_KEY].items` and per-chat `chatIndex.organization.folderId/folder_id` hints, then writes through `store.folders.bindChat(...)`.
- `importFolderStateOnly(...)` can apply a folder-state-only payload to Desktop folders plus `folder_bindings`, with orphan warnings when chats or folders are missing.
- Current active Chrome-to-Desktop supported bundle logic in `folder-sync.tauri.js`:
  - declares supported fields for folder metadata, folder delete requests, and folder restore requests, not full chat-folder binding sync.
  - strips `folderState.items` to `{}` and warns with `library-propagation-chat-folder-bindings-deferred`.
  - preserves safe per-chat `organization.folderId` from Chrome chats for importer compatibility, but this is not a complete request/receipt lifecycle.
- Current active Desktop-to-Chrome supported bundle logic in `folder-import.mv3.js`:
  - warns with `library-propagation-chat-folder-bindings-deferred` when source folder `items` are present.
  - strips `folderState.items` to `{}`.
  - removes per-chat folder organization fields from Desktop-to-Chrome chat rows.
- Existing F19 validators intentionally assert the deferred state:
  - Chrome-to-Desktop validator checks `folderState.items` is empty while per-chat `folderId` can remain available for importer compatibility.
  - Desktop-to-Chrome validator checks `folderState.items` is empty and per-chat `folderId/folderName` are stripped.
  - Live parity proof still lists chat-folder bindings as deferred.

### Existing Binding Lane Scaffolding

- `sync/library/library-folder-binding-bridge-diagnostic.tauri.js` maps existing F7 folder bindings into the future `library.binding` `chat-folder` identity model without writes.
- `sync/library/library-binding-canonicalizer.tauri.js` supports `bindingKind:"chat-folder"` and forbids raw endpoint IDs in canonical output.
- `sync/library/library-binding-preflight.tauri.js` supports bind/unbind operations and has conflict codes such as `chat-folder-conflict`.
- `sync/library/library-binding-apply-event-receipt.tauri.js` can shape read-only apply-event receipts for `library.binding` operations.
- `sync/execute/adapters/library-binding-execute-adapter.tauri.js` supports `CHAT_FOLDER_KIND = "chat-folder"` as a Native-owned metadata-only lane.
- These files are useful as canonicalization, privacy, preflight, and receipt scaffolding. They do not by themselves close Chrome/Desktop local RC binding propagation.

## What Already Works

- Desktop can assign a chat to a folder.
- Desktop can move a chat between folders via `INSERT OR REPLACE`.
- Desktop can unfile a chat by deleting the binding row through `unbindChat`.
- Desktop soft delete captures binding snapshots and unbinds chats without deleting chats or snapshots.
- Desktop restore can rebind from the recovery snapshot when the chat is present and not already moved elsewhere.
- The existing import bundle machinery can write folder bindings from a folder-state payload or per-chat folder hints.
- The existing sync request/receipt architecture from Phases 6B and 6C provides a proven pattern for Chrome request-only UX, Desktop authoritative apply, Desktop receipt export, and Chrome receipt import.

## What Is Missing

- A side-by-side diagnostic that compares Desktop canonical bindings, Desktop export bindings, Chrome mirror bindings, Chrome UI folder membership, Unfiled fallback, and stale/deleted-folder references.
- A Desktop-to-Chrome canonical binding projection consumed by Chrome without reviving stale or deleted-folder bindings.
- A Chrome-to-Desktop binding mutation request contract for assign, move, and unfile.
- Desktop guarded apply for Chrome binding requests.
- Desktop binding apply receipts and Chrome receipt import/resolution.
- Binding-aware proof that folder delete with chats moves affected chats to Unfiled on both surfaces.
- Binding-aware proof that folder restore rebinds prior chats on both surfaces when safe.
- Conflict handling for same chat moved on both surfaces.
- Validators for transport, authority, delete fallback, restore rebind, reload stability, and no chat/snapshot deletion.

## Recommended Authority Model

- Desktop remains authoritative for canonical chat-folder binding state.
- Chrome may display Desktop canonical binding state as a mirror.
- Chrome may initiate assign/move/unfile only as a request/intention once a request/receipt contract exists.
- Desktop validates and applies Chrome binding requests.
- Chrome does not directly mutate Desktop-owned canonical binding state.
- Chrome must not delete chats, snapshots, assets, folders, tombstones, or receipts as part of binding sync.
- Folder delete and restore remain Desktop-owned lifecycle decisions. Binding effects of those operations are exported as canonical state and/or receipts.
- Unfiled should be treated as fallback state caused by no binding row, not as a destructive folder assignment.

## Proposed Implementation Slices

### B1 - Audit Diagnostics and Validators

Add a read-only binding parity diagnostic and a static validator before mutating transport contracts.

Diagnostic should report:

- `desktopBindingCount`
- `desktopBindings` by `chatId/folderId` with optional redaction mode
- `desktopUnfiledCandidateCount`
- `desktopDeletedFolderBoundChatCount`
- `desktopRestoredSnapshotBindingCount`
- `desktopExportBindingCount`
- `chromeMirrorBindingCount`
- `chromeUiBindingCount`
- `chromePendingBindingRequestCount`
- `chromeReceiptConfirmedBindingCount`
- `desktopOnlyBindings`
- `chromeOnlyBindings`
- `mismatchedBindings`
- `deletedFolderBindings`
- `staleChatBindings`
- `unfiledFallbackCount`
- safety flags: `noChatDelete:true`, `noSnapshotDelete:true`, `noHardDelete:true`, `noChromeDirectBindingApply:true`

Suggested validator:

- `tools/validation/sync/validate-chat-folder-binding-phase-b1-audit.mjs`

### B2 - Desktop Binding Export

Export a canonical Desktop binding projection with the same folder visibility/suppression rules as the folder list:

- `schema:"h2o.studio.chat-folder-bindings.v1"`
- `bindings:[{ chatId, folderId, assignedAt, source:"desktop-canonical-folder-bindings" }]`
- `unfiledPolicy:"absence-of-binding-row"`
- exclude bindings to active deleted, purged, suppressed, or system/protected folders.
- include diagnostics for skipped/deleted-folder/stale-chat bindings.

### B3 - Chrome Binding Import and Display Parity

Import the Desktop canonical binding projection into Chrome as mirror state:

- update folder membership counts and chat visibility under folders,
- remove stale Chrome-only binding rows when Desktop canonical projection is present,
- do not create Chrome authority,
- preserve reload stability.

### B4 - Chrome Binding Request Export

Allow Chrome assign, move, and unfile as request-only operations:

- `folderBindingRequests[]`
- operation: `bind`, `move`, `unbind`
- folderId/chatId/currentFolderId/expectedVersion where available
- duplicate/idempotency handling
- no direct Chrome apply.

### B5 - Desktop Binding Request Apply and Receipt

Desktop imports Chrome binding requests and applies only safe requests:

- block missing chat,
- block missing/deleted/purged/protected folder,
- block stale expected binding unless conflict policy allows,
- apply through `store.folders.bindChat/unbindChat`, not raw SQL,
- export binding receipts for Chrome to resolve pending state.

### B6 - Folder Delete Binding Fallback / Unfiled Proof

Prove deleting a folder with bound chats:

- captures binding recovery snapshot,
- unbinds chats to Unfiled on Desktop,
- exports canonical binding projection,
- Chrome removes those chats from the deleted folder and shows them as Unfiled,
- no chat/snapshot deletion occurs.

### B7 - Folder Restore Rebind Proof

Prove restoring a folder:

- rebinds eligible chats from recovery snapshot,
- skips chats moved elsewhere,
- exports updated canonical binding projection/receipt,
- Chrome mirrors restored bindings,
- stale Chrome Unfiled fallback does not win after Desktop canonical restore.

### B8 - Closeout

Close chat-folder binding sync only after:

- assign/move/unfile parity passes,
- folder delete fallback passes,
- folder restore rebind passes,
- Chrome reload does not resurrect stale bindings,
- Desktop/Chrome folder counts and chat lists agree,
- all safety flags remain true.

## Runtime Proof Targets

- Desktop assigned chat appears in the same folder in Chrome after Desktop-to-Chrome sync.
- Chrome-requested assignment appears in Desktop only after Desktop apply, then Chrome resolves pending state after receipt/import.
- Moving a chat from folder A to folder B converges to one binding on both surfaces.
- Unfiling a chat removes the binding on both surfaces and surfaces it through Unfiled fallback.
- Deleting a folder with chats moves those chats to Unfiled on both surfaces and does not delete chats or snapshots.
- Restoring that folder rebinds eligible chats on both surfaces.
- Restoring skips chats that were moved elsewhere after delete.
- Purged or suppressed folders cannot regain bindings.
- Chrome reload does not resurrect stale binding rows.

## Validators Needed

- `validate-chat-folder-binding-phase-b1-audit.mjs`
- `validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `validate-chat-folder-binding-phase-b3-chrome-import-display.mjs`
- `validate-chat-folder-binding-phase-b4-chrome-request-export.mjs`
- `validate-chat-folder-binding-phase-b5-desktop-apply-receipt.mjs`
- `validate-chat-folder-binding-phase-b6-delete-unfiled-fallback.mjs`
- `validate-chat-folder-binding-phase-b7-restore-rebind.mjs`
- closeout validator that re-runs the relevant Phase 6B/6C delete/restore guards plus binding parity.

## Risks and Edge Cases

- Missing folder: block binding request and do not create a folder implicitly.
- Deleted folder: block new bindings and move affected chats to Unfiled only through Desktop-owned delete lifecycle.
- Restored-history folder: do not treat restored history rows as active deleted folders.
- Duplicate folder names: bind by folder ID only, never by name.
- Stale chat IDs: skip with warning; do not create shell chats in the binding lane.
- Missing snapshots: binding sync must not require or delete snapshots.
- Same chat moved on both surfaces: Desktop request apply must detect stale expected binding and emit a conflict/rejected receipt.
- Chrome reload resurrection: canonical Desktop projection must suppress stale Chrome mirror/request rows.
- Unfiled fallback: absence of binding row is the source of truth; do not bind to a mutable Unfiled folder row.
- Folder purge/permanent suppression: Chrome and Desktop must not restore bindings to purged/suppressed folder IDs.

## First Implementation Recommendation

Start with B1: add the read-only `diagnoseChatFolderBindingParity` diagnostic and `validate-chat-folder-binding-phase-b1-audit.mjs`.

Reason: there are several existing paths that can read, write, infer, or strip folder bindings. A side-by-side diagnostic should lock the current truth before changing transport. It also gives later slices a stable proof target for assign/move/unfile, folder delete fallback, and restore rebind parity without re-opening the already-closed folder delete/restore authority model.

## Non-Goals For This Gap

- No labels/tags/categories sync.
- No WebDAV/cloud/relay.
- No identity/signing/onboarding work.
- No Chrome purge/permanent delete.
- No Chrome direct tombstone apply/create.
- No chat deletion.
- No snapshot deletion.
- No hard delete.
- No destructive folder binding mutation from Chrome except through a future request/receipt path.

## Validation

- `git diff --check`
- `git diff --cached --check`
