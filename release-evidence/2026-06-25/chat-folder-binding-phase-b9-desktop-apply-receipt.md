# Chat-Folder Binding Phase B9: Desktop Apply + Receipt for Chrome-Origin Requests

## Verdict

STATIC PASS / RUNTIME BLOCKED.

B9 closes the missing Desktop-authoritative half of the Chrome-origin chat-folder binding request flow. Chrome can export request-only `chatFolderBindingRequests[]`; Desktop now imports, validates, applies through the canonical binding writer, and exports trusted `chatFolderBindingReceipts[]` plus the updated Desktop canonical binding projection.

## Request Under Test

B8 proved this Chrome-origin request in `chrome-latest.json`:

- requestId: `chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52`
- schema: `h2o.studio.chat-folder-binding-request.v1`
- recordKind: `folderBinding`
- intent: `chat-folder-binding-request`
- classification: `binding-request`
- chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- conversationId: `69dd285f-16ec-8390-a458-0574c6ea956e`
- expectedCurrentFolderId: `f_e301f3506938c19dbac0e304`
- targetFolderId: `f_2bb1037f88b2719dbac10c22`
- sourceSurface: `chrome-studio`
- status: `pending`

## B9 Contract

Desktop import/apply:

- imports `chatFolderBindingRequests[]` from Chrome-to-Desktop transport.
- validates schema, record kind, classification, pending status, Chrome source, chat identity, target folder, and `expectedCurrentFolderId`.
- applies valid moves through Desktop canonical authority only.
- treats duplicate/already-applied requests idempotently.
- blocks malformed, deleted-target, missing-target, and current-folder mismatch requests.
- never grants Chrome direct binding authority.

Desktop receipt/export:

- exports `chatFolderBindingReceipts[]` in Desktop-to-Chrome latest bundles.
- includes request id, chat/conversation id, before/after folder ids, applied decision, applied timestamp, validation result, and safety flags.
- exports the updated `desktopCanonicalChatFolderBindings` projection alongside the receipt.

Chrome import:

- imports trusted Desktop binding receipts.
- resolves matching local pending binding requests as Desktop-confirmed.
- keeps Chrome display/read-model parity tied to the Desktop canonical projection.
- does not mutate Desktop canonical bindings locally.

## Expected Runtime Counts

Pre-apply Desktop canonical state:

- totalBindingCount: `12`
- knownChatCount: `41`
- unfiledCount: `29`
- Code `f_e301f3506938c19dbac0e304`: `1`
- English `f_2bb1037f88b2719dbac10c22`: `0`
- Tech `f_3bf15f43b835d19dbac0fb13`: `2`

Post-apply expected Desktop canonical state:

- totalBindingCount: `12`
- knownChatCount: `41`
- unfiledCount: `29`
- Code `f_e301f3506938c19dbac0e304`: `0`
- English `f_2bb1037f88b2719dbac10c22`: `1`
- Tech `f_3bf15f43b835d19dbac0fb13`: `2`

Expected Chrome parity after Desktop export/import:

- parityComparable: `true`
- parityOk: `true`
- chromeDisplayBindingCount: `12`
- missingInChromeCount: `0`
- extraInChromeCount: `0`
- folderCountMismatchCount: `0`
- Code count: `0`
- English count: `1`
- Tech count: `2`

## Safety Boundaries

- Chrome remains request-only.
- No Chrome destructive binding authority.
- No direct Chrome canonical binding write.
- no hard delete.
- no purge.
- no chat delete.
- no chat deletion.
- no snapshot delete.
- no snapshot deletion.
- no asset delete.
- no asset deletion.

## Runtime Proof

Blocked by unavailable Desktop Studio smoke queue.

Observed runtime state:

- `chrome-latest.json` exists in `/Users/hobayda/H2O Studio Sync`.
- `chatFolderBindingRequests[]` exists.
- target request is present:
  - requestId: `chat-folder-binding-request:e54fda11-d9f0-498e-bdea-62187c5aad52`
  - chatId: `69dd285f-16ec-8390-a458-0574c6ea956e`
  - expectedCurrentFolderId: `f_e301f3506938c19dbac0e304`
  - targetFolderId: `f_2bb1037f88b2719dbac10c22`
  - sourceSurface: `chrome-studio`
  - status: `pending`
  - noChromeBindingAuthority: `true`
  - noChromeDestructiveBindingApply: `true`
  - noDesktopCanonicalMutation: `true`
  - noHardDelete: `true`
  - noPurge: `true`
  - noChatDelete: `true`
  - noSnapshotDelete: `true`
  - noAssetDelete: `true`

Desktop runtime blocker:

- `node tools/smoke/desktop-folder-sync-queue-client.mjs --op diagnoseChatFolderBindingParity --timeout-ms 60000`
- result:
  - ok: `false`
  - status: `desktop-queue-timeout`
  - commandPath: `/Users/hobayda/H2O Studio Sync/.h2o-smoke/desktop-command.json`
  - resultPath: `/Users/hobayda/H2O Studio Sync/.h2o-smoke/results/desktop-diagnoseChatFolderBindingParity-mqy2jzkp.json`
  - blockers: `["desktop-queue-timeout"]`
  - nextAction: open Desktop Studio with `?h2oSmokeBridge=folder-sync-rc`, enable localStorage key `h2o:studio:smoke-bridge:enabled:v1` to `folder-sync-rc`, and confirm `H2O.Studio.devSmoke.folderSyncQueue.diagnose().started` is true.

Additional operator diagnosis:

- Chrome Studio process was running on remote debugging profile.
- Desktop Studio process was not found in the process list.
- `curl -I --max-time 5 'http://127.0.0.1:1430/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders'` failed to connect to port `1430`.

Interpretation:

- The B8 Chrome request transport precondition is present and valid.
- B9 static implementation and validators are green.
- B9 runtime apply/receipt cannot be completed until Desktop Studio is running with the folder-sync RC smoke bridge enabled.

Required runtime sequence:

1. Confirm B8 request exists in `chrome-latest.json`.
2. Confirm Desktop pre-apply canonical binding counts.
3. Run Desktop Chrome-to-Desktop import/apply.
4. Confirm Desktop post-apply canonical binding counts.
5. Confirm duplicate apply is idempotent or already-applied.
6. Export Desktop-to-Chrome latest bundle.
7. Import latest bundle in Chrome.
8. Confirm Chrome binding parity is green and receipt/request state is resolved.

## Validation

Passed:

- `node --check src-surfaces-base/studio/store/tombstone-reviews.tauri.js`
- `node --check src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `node --check src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
- `node --check src-surfaces-base/studio/store/tombstone-reviews.mv3.js`
- `node --check src-surfaces-base/studio/sync/folder-import.mv3.js`
- `node --check tools/validation/sync/validate-chat-folder-binding-phase-b9-desktop-apply-receipt.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b9-desktop-apply-receipt.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b8-chrome-request-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b7-restore-rebind.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b6-delete-fallback.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b5-desktop-origin-convergence.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b4-chrome-display-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b3-chrome-import-parity.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b2-desktop-export.mjs`
- `node tools/validation/sync/validate-chat-folder-binding-phase-b1-diagnostics.mjs`
- `node tools/validation/sync/validate-folder-restore-phase6c4-receipt-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b6-purge-resurrection-parity.mjs`
- `node tools/validation/sync/validate-folder-delete-phase6b5-recently-deleted-parity.mjs`

## Remaining Work

None expected for B9 if runtime proof passes. A later closeout can cover the full Chrome-origin binding lifecycle after evidence is collected.
