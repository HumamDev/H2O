# Folder Sync - F28 S11: Chrome/native/mobile Binding-Mismatch Reviewed Request-Submission Proofs

Verdict: **F28 S11 PROVEN (EVIDENCE/VALIDATOR-ONLY) - ALL SURFACES SUBMIT `binding-mismatch` THROUGH THE REVIEWED
F15 request -> validate -> apply -> receipt PATH; NO SURFACE PERFORMS CANONICAL LOCAL BINDING MUTATION, RENDER-MIRROR
REPAIR, OR FALLBACK**.

This slice is evidence/validator-only: the reviewed submission paths already exist in source. No product source was
changed, no `productSyncReady` flip, no WebDAV/cloud/relay, no Chat Saving CAS, no fallback, no F11 render-mirror
writer, no live Phase A/Phase B rerun.

## Commit Chain

- F28 sequencing plan (S11 = Chrome/native/mobile submission proofs; S12 next): `folder-sync-f28-implementation-sequencing-plan.md`.
- S9 F15 live restart-survival closeout (Desktop apply path live-proven): `138f7e12`.
- S10 binding-mismatch reviewed repair path (routing declared; render mirror render-only): `69e5a33d`.
- S5-stale F12/F13 validator cleanup: `e1ac5299`.

## Q7 - Is S11 evidence-only or does it need source?

Evidence/validator-only. The reviewed submission paths for every relevant surface already exist in source; S11 proves
them, it does not build them.

## Q1 / Q2 - Surfaces and where each submits the reviewed request

### Chrome Studio / extension (surfaceKind `chrome-extension`)

`src-surfaces-base/studio/sync/auto-import.mv3.js` normalizes and exports a pending reviewed binding request:
- `schema: CHAT_FOLDER_BINDING_REQUEST_SCHEMA` = `h2o.studio.chat-folder-binding-request.v1`.
- `intent: 'chat-folder-binding-request'`, `classification: 'binding-request'`, `recordKind: 'folderBinding'`.
- `reviewId` (+ `requestId`), `chatId`, `expectedCurrentFolderId`, `targetFolderId` / `targetUnfiled` (bind / unbind /
  move end-state).
- `status: 'pending'`, `desktopApplyRequired: true`, `noLocalApply: true`, `noChromeBindingAuthority: true`,
  `noChromeDestructiveBindingApply: true`, `noDesktopCanonicalMutation: true`, `noTombstoneApply: true`.
- Exported via `CHAT_FOLDER_BINDING_REQUEST_EXPORT_KEY` =
  `h2o:studio:chat-folder-binding-requests:pending-export:v1` (mirror schema
  `h2o.studio.chat-folder-binding-request.pending-export-mirror.v1`) for Desktop to import and apply.

Chrome proposes only; Desktop applies. No local/canonical binding mutation happens on Chrome.

### Native ChatGPT page integration (surfaceKind `native-extension`) and Mobile (surfaceKind `mobile`)

The reviewed request schema is surface-agnostic. The Desktop reviewed validate requires
`surfaceKind ∈ ['chrome-extension', 'native-extension', 'mobile']` (else
`chat-folder-binding-request-surface-kind-invalid`), so native-extension and mobile proposers submit the SAME
`h2o.studio.chat-folder-binding-request.v1` request (carrying their `surfaceKind`) through the identical reviewed path.
These surfaces are represented by the accepted surfaceKind contract rather than dedicated JS builders in this repo; the
live Phase A proof used `surfaceKind:"chrome-extension"` as the representative submitting surface.

### Desktop Studio

`src-surfaces-base/studio/sync/folder-sync.tauri.js` validates the request (schema, `surfaceKind`, safety flags) and
applies it via the F15-settled repair handler (durable gate, conflict runtime, `requireContext`, planned-unbind
projection, restart convergence), gated by `folder-sync-chat-folder-binding-repair-apply`, emitting a receipt. This
apply path is live-proven end-to-end by S9 (`138f7e12`).

## Q3 - Every request routes to the reviewed F15-settled path with the apply gate

Yes. Requests are applied only through the Desktop reviewed handler behind the apply gate
`folder-sync-chat-folder-binding-repair-apply`; there is no other canonical binding writer available to Chrome / native
/ mobile.

## Q4 - Does any surface attempt direct local binding writes / render-mirror repair / fallback / unreviewed mutation?

No.
- Chrome MV3 (`auto-import.mv3.js`, `folder-import.mv3.js`) performs NO `folder_bindings` `INSERT`/`DELETE`, no
  `bindChat`/`unbindChat`, no `moveCanonicalChatFolderBinding`.
- The requests carry `noLocalApply:true`, `noChromeBindingAuthority:true`, `noDesktopCanonicalMutation:true` and (per
  the Desktop validate) require `noChromeCanonicalMutation` / `noChromeBindingAuthority`.
- No fallback (`allowF7Fallback` / `f15AllowF7Fallback` / `explicitF7Fallback`) in the submission surfaces.
- F11 render mirror stays render-only: S10 declares `binding-mismatch` routed to the reviewed path
  (`reviewedRepairPathClasses: ['binding-mismatch']`, `bindingMismatchRoutedToReviewedRepairPath: true`) while keeping
  `noBindingRepair:true`, `noBindingWrite:true`, and `binding-mismatch` a blocked/non-allowed render-mirror class.

## Q5 - Request and receipt schemas minted and emitted consistently

- Request schema: `h2o.studio.chat-folder-binding-request.v1` (used by Chrome MV3 submission and the Desktop validate).
- Receipt schema: `h2o.studio.chat-folder-binding-receipt.v1` - `buildChatFolderBindingRepairReceipt` emits
  `schema: CHAT_FOLDER_BINDING_RECEIPT_SCHEMA` and records `surface: req.surfaceKind`, so every apply/dry-run/reject
  outcome yields a v1 receipt that names the submitting surface.

## Q6 - What proof S11 requires (all satisfied here)

- Request schema `h2o.studio.chat-folder-binding-request.v1` used by the submitting surfaces.
- Chrome submits pending reviewed requests (`desktopApplyRequired`, `noLocalApply`, no canonical mutation) and exports
  them for Desktop apply; native/mobile accepted via the surfaceKind contract.
- Apply gate `folder-sync-chat-folder-binding-repair-apply`; receipt schema `h2o.studio.chat-folder-binding-receipt.v1`.
- No surface performs canonical local binding mutation, render-mirror repair, or fallback.
- `noLocalApply:true`, `desktopApplyRequired:true`, and `noChromeCanonicalMutation` / `noChromeBindingAuthority`
  preserved.
- S10 routing + render-only F11 boundary intact; `productSyncReady:false`; WebDAV/cloud/relay + Chat Saving CAS blocked.

## Boundaries Held

- No product source edited (evidence/validator-only).
- `productSyncReady` remains `false`; not flipped.
- No WebDAV/cloud/relay/`fullBundle.v3`; no Chat Saving WebDAV/cloud/archive CAS.
- No fallback; no bare `moveCanonicalChatFolderBinding`; durable/hash gates, conflict runtime, `requireContext`, and
  restart convergence unchanged; F11 render mirror not turned into a writer.
- No live Phase A/Phase B rerun by this slice.

## Next

S11 is proven: Chrome/native/mobile submit `binding-mismatch` through the reviewed F15 request -> apply -> receipt path,
with no canonical local mutation or fallback. The next F28 gate is **S12** (multi-device import/read-only proofs: a
second device imports the projection + receipts read-only, no canonical mutation). `productSyncReady` stays `false`
until S12 and explicit readiness approval. WebDAV/cloud/relay remains deferred and is not next.
