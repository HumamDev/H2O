# Folder Sync - F28 S12: Multi-Device Import / Read-Only Proofs

Verdict: **F28 S12 PROVEN (EVIDENCE/VALIDATOR-ONLY) - A SECOND DEVICE IMPORTS/OBSERVES THE BINDING PROJECTION + RECEIPTS
READ-ONLY; RECEIPTS ARE READ-ONLY EVIDENCE (NOT REPAIR COMMANDS); NO IMPORT PATH PERFORMS DIRECT/BARE BINDING REPAIR,
FALLBACK, OR UNREVIEWED CANONICAL MUTATION**.

This slice is evidence/validator-only: the read-only export projection + receipt-evidence import already exist in
source. No product source was changed, no `productSyncReady` flip, no WebDAV/cloud/relay, no Chat Saving CAS, no
fallback, no F11 render-mirror writer, no live Phase A/Phase B rerun.

## Commit Chain

- F28 sequencing plan (S12 = multi-device import/read-only; then productSyncReady readiness decision):
  `folder-sync-f28-implementation-sequencing-plan.md`.
- S9 F15 live restart-survival closeout: `138f7e12`.
- S10 binding-mismatch reviewed repair path: `69e5a33d`.
- S11 Chrome/native/mobile reviewed request-submission proofs: `c9fcc08b`.

## Q7 - Is S12 evidence-only or does it need source?

Evidence/validator-only. The multi-device read-only import/observe of the binding projection + receipts already exists
in source; S12 proves it.

## Q1 / Q2 - Import/read-only paths and which artifacts they include

The cross-device wire is `h2o.studio.fullBundle.v2` (`export-bundle.tauri.js` / `import-bundle.tauri.js`). The exported
bundle carries the binding artifacts as READ-ONLY evidence/projection:

- **Read-only canonical binding projection**: exported with `readOnlyProjection: true`, schema
  `h2o.studio.chat-folder-bindings.desktop-canonical.v1`, built via public read APIs (`listChats`,
  `listCanonicalChatFolderBindings`) - no write.
- **Chat-folder binding repair receipts**: `chatFolderBindingReceipts: asArray(chatFolderBindingReceiptExport.receipts)`,
  each `schema: h2o.studio.chat-folder-binding-receipt.v1` (limit 1000), collected read-only from
  `store.tombstoneReviews.listChatFolderBindingReceipts` and schema-validated on export.

## Q3 / Q4 - Second device reads without canonical mutation; no import path does bare repair / fallback

- The **read-only projection** and **receipts** are observed read-only: producing them is a read (public APIs), and the
  receipts are evidence records, not apply commands.
- **Receipts are read-only evidence, not repair commands**: there is NO receipt -> binding-repair re-apply path in the
  import - importing/reading a receipt does not call `bindChat`/`unbindChat`/`moveCanonicalChatFolderBinding` and does
  not write `folder_bindings`.
- **`import-bundle.tauri.js` performs NO direct/bare binding mutation**: no `INSERT`/`DELETE` on `folder_bindings`, no
  `moveCanonicalChatFolderBinding`, and no fallback (`allowF7Fallback` / `f15AllowF7Fallback` / `explicitF7Fallback`).
  The only binding write available to the import is `folderStore.bindChat(...)` - the F15-settled, durable-gated,
  reviewed single-writer path (used for folder-membership apply on an authorized Desktop), never a bare or unreviewed
  second-device write.
- Non-Desktop surfaces cannot apply canonically: reviewed requests carry `desktopApplyRequired:true`,
  `noLocalApply:true`, and `noChromeCanonicalMutation` / `noChromeBindingAuthority`.

So a second device / importing surface can import or observe the binding projection + receipts safely in read-only mode:
receipts are evidence, the projection is read-only, and the only canonical binding writer remains the F15-settled
reviewed apply path (never a bare/fallback import write).

## Q5 - Receipts preserved with the full reviewed metadata

The exported `chatFolderBindingReceipts` preserve:
- request schema `h2o.studio.chat-folder-binding-request.v1` and receipt schema `h2o.studio.chat-folder-binding-receipt.v1`;
- reviewed request metadata (`requestId` / `reviewId`, outcome `status`/`reason`) and `surface` (the submitting
  surfaceKind: `chrome-extension` / `native-extension` / `mobile`);
- the `noLocalApply` / `desktopApplyRequired` / `noChromeCanonicalMutation` constraints from the originating reviewed
  request path.

## Q6 - Is read-only multi-device import already present?

Yes - the read-only projection export (`readOnlyProjection:true`), the read-only receipt-evidence export
(`chatFolderBindingReceipts`), and the import's absence of any bare/direct/fallback binding write make S12
evidence/validator-only.

## Boundaries Held

- No product source edited (evidence/validator-only).
- `productSyncReady` remains `false`; not flipped.
- No WebDAV/cloud/relay/`fullBundle.v3`; no Chat Saving WebDAV/cloud/archive CAS.
- No fallback; no bare `moveCanonicalChatFolderBinding`; durable/hash gates, conflict runtime, `requireContext`,
  restart convergence, and the reviewed request path unchanged; F11 render mirror not turned into a writer.
- No live Phase A/Phase B rerun by this slice.

## Next

S12 is proven: a second device imports/observes the binding projection + receipts read-only, with no bare/direct
binding repair, fallback, or unreviewed canonical mutation. With S9 (Desktop apply + restart survival), S10 (reviewed
repair path), S11 (multi-surface submission), and S12 (multi-device read-only import) all proven, the next step is the
**productSyncReady readiness DECISION** - an explicit, reviewed decision, NOT an automatic flip. `productSyncReady`
stays `false` until that decision. WebDAV/cloud/relay remains deferred and is not next.
