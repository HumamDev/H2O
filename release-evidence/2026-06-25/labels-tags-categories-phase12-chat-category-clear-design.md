# Labels / Tags / Categories / Classification Metadata Sync

## Phase 12 Design-Only Review: Guarded Non-Destructive `chat-category-clear`

Date: 2026-06-29

## Status

DESIGN-ONLY. This phase is a specification/review. It is **not implemented** and **not applied**.
No source modules were modified. No new applied request type is enabled. `chat-category-assign`
remains the only currently applied metadata request type. A future implementation phase (not this one)
would build and runtime-prove `chat-category-clear` before it is applied.

## Context Commits

- Phase 6 Chrome request export: `91e1c95`
- Phase 7 Desktop apply + receipts: `8addf3a`
- Phase 8 Chrome receipt import/display: `2b6116f`
- Phase 9 end-to-end runtime proof: `ede1f66`
- Phase 10 read-only status display: `daf28cc`
- Phase 11 closeout/readiness audit: `b16fa29`
  (`release-evidence/2026-06-25/labels-tags-categories-phase11-closeout-readiness-audit.md`)
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`

## Semantic Rule (non-negotiable)

`chat-category-clear` means clearing a chat's category assignment only — setting the chat's
`category_id` to none/NULL. It is a **non-destructive reassignment-to-none**. It must **never** delete
the chat, delete the category, delete metadata rows, delete snapshots or assets, or purge/hard-delete
anything. It is the inverse of `chat-category-assign`, not a deletion.

## 1. Audit of the Existing chat-category-assign Chain (Phases 6–11)

The proven safe loop, which `chat-category-clear` must slot into unchanged in shape:

- Phase 6 (`91e1c95`): Chrome shapes a request via `requestLibraryMetadataMutation` into
  `libraryMetadataMutationRequests[]` (schema `h2o.studio.library-metadata-mutation-request.v1`),
  request-only (`requestOnly: true`, `desktopApply: false`, `noLocalApply: true`).
- Phase 7 (`8addf3a`): Desktop `importChromeLatestBundle` →
  `autoApplyLibraryMetadataMutationRequestsFromChromeBundle` →
  `validateLibraryMetadataMutationRequestForDesktopApply` →
  `applyChatCategoryAssignLibraryMetadataRequest` (real store mutation via
  `H2O.Studio.store.categories.assignChat`) → receipt via `libraryMetadataMutationReceiptFromRequest`
  (schema `h2o.studio.library-metadata-mutation-receipt.v1`). The apply allowlist is gated by
  `if (action !== 'chat-category-assign')` → otherwise
  `library-metadata-mutation-request-action-deferred-phase7`.
- Phase 8 (`2b6116f`): Chrome `importLibraryMetadataMutationReceiptsFromDesktopBundle` imports Desktop
  receipts read-only and marks the matching pending request resolved in the read-model/outbox only.
- Phase 2 (`02dbf4e`) / Phase 3 (`60d3c74`) / Phase 5 (`93d07f3`): Desktop canonical export
  (`desktopCanonicalLibraryMetadata`) reflects the assignment; Chrome projection refresh shows
  sanitized counts/hashes; display parity holds.
- Phase 10 (`daf28cc`): read-only `libraryMetadataSyncStatus` surface reports request/receipt counts;
  `onlyRuntimeProvenAppliedType: 'chat-category-assign'`.
- Phase 11 (`b16fa29`): closeout/readiness audit; safe loop ready-for-review; broad sync NOT READY.

## Central Design Problem: the destructive-guard substring match

Both surfaces classify destructive-shaped actions with the same regex (verified in source):

- Chrome: `libraryMetadataMutationDeferredDestructiveAction` in
  `src-surfaces-base/studio/sync/folder-import.mv3.js` — `/(delete|remove|unbind|clear|purge|hard-delete)/i`.
- Desktop: `libraryMetadataMutationRequestDestructiveAction` in
  `src-surfaces-base/studio/sync/folder-sync.tauri.js` — `/(delete|remove|unbind|clear|purge|hard-delete)/i`.

The literal `chat-category-clear` contains the substring `clear`, so today it is correctly treated as
destructive-shaped and deferred/blocked. Phase 10's status model lists `chat-category-clear` under
`deferredDestructiveShapes` for exactly this reason.

The design therefore requires a **precise, exact-match carve-out**, not a regex loosening. A future
implementation phase would:

- Introduce a `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])` on each surface.
- Change the guard to `isDestructive(action) = destructiveRegex.test(action) && !NON_DESTRUCTIVE_CLEAR_ALLOWLIST.has(action)`.
- Because the allowlist is an exact-string set, every genuine destructive action stays blocked:
  `category-delete`, `chat-label-unbind`, `purge`, `hard-delete`, and any other `*-clear`/`*-delete`
  variant not exactly equal to `chat-category-clear`.

This is the only guard change the feature needs; it does not weaken any existing block.

## 2. Where chat-category-clear Fits the Chain (unchanged shape)

Identical chain to `chat-category-assign`, with the apply mapping to a clear instead of an assign:

Chrome request export → Desktop validate/apply (clear) → Desktop receipt → Chrome receipt
import/resolution → Desktop canonical export (assignment count decremented) → Chrome projection
refresh → read-only status surface. The request, receipt, idempotency, basis-hash, and resolution
machinery are reused as-is; only the action allowlist, the spec entry, and the apply store call differ.

## 3. Request Schema Extension (allowed-action addition)

Reuse schema `h2o.studio.library-metadata-mutation-request.v1` (no schema version bump required;
this is an additional allowed action, not a shape change).

- `action` / `requestType`: `chat-category-clear`
- `operation`: `clear`
- `metadataKind`: `category`
- `subjectKind`: `chat-category-assignment`
- Payload shape: `{ chatId: <id>, categoryId: null, conversationId: <id> }` — **no target category**
  (clearing to none). `entityId`/`categoryId` are null by design.
- Action spec (mirrors the assign entry, with `requiresId: false`):
  `{ metadataKind: 'category', subjectKind: 'chat-category-assignment', operation: 'clear', requiresChatId: true, requiresId: false }`.
- Idempotency key (same construction as Phase 6, entity/displayName slots empty):
  `['library-metadata-mutation-request', 'chat-category-clear', 'category', chatId, '-', '-', expectedCurrentBasisHash].join(':')`.
- `expectedCurrentBasisHash`: same handling as assign — auto-filled from the Chrome-imported
  `desktopCanonicalLibraryMetadata` projection hash; used by Desktop for the stale-basis check.
- `sourceSurface` / `source` / `requestedBy`: `chrome-studio`; `sourcePeerId`: `chrome-studio`.
- Privacy flags: `rawChatContent: false`, `rawChatTitles: false`, `accountLinkedMetadata: false`;
  no display name is included (clearing has no user-entered name).
- Safety flags (unchanged from assign): `requestOnly: true`, `desktopApplyRequired: true`,
  `desktopApply: false`, `noLocalApply: true`, `noChromeCanonicalMutation: true`,
  `noDesktopCanonicalMutation: true`, `separateFromDesktopCanonicalLibraryMetadata: true`,
  `noHardDelete: true`, `noPurge: true`, `noChatDelete: true`, `noSnapshotDelete: true`,
  `noAssetDelete: true`, `noLabelDelete: true`, `noTagDelete: true`, `noCategoryDelete: true`,
  `noMetadataDelete: true`.

## 4. Desktop Validation Contract (design)

Mirrors `validateLibraryMetadataMutationRequestForDesktopApply` with the clear carve-out:

- schema == `h2o.studio.library-metadata-mutation-request.v1`; intent ==
  `library-metadata-mutation-request`; status == `pending`.
- `requestId`/`reviewId` present and safe; `idempotencyKey` present.
- `sourceSurface` == `chrome-studio`; apply/mutation/safety flag checks as today.
- Action allowlist: `chat-category-assign` **and** `chat-category-clear` only. Every other action stays
  deferred (`library-metadata-mutation-request-action-deferred-phase7`).
- Non-destructive guarantee: `chat-category-clear` is recognized via the exact-match allowlist and
  routed to the clear apply path; the destructive regex still blocks all other `clear`/`delete`/etc.
- Target existence: `chatId` required and the chat row must exist (else `rejected`).
- Current basis check: if the request carries `expectedCurrentBasisHash` and Desktop can compute the
  current projection hash, mismatch → `stale_basis`; basis present but projection unavailable →
  `deferred` (`library-metadata-mutation-request-basis-unavailable`), as for assign.

## 5. Desktop Apply Contract (design only — NOT implemented)

- Store path: `H2O.Studio.store.categories.clearChat(chatId)` — verified to exist at
  `src-surfaces-base/studio/store/categories.tauri.js:415`. It runs
  `UPDATE chats SET category_id = NULL, updated_at = ? WHERE id = ?` and resolves `true` when
  `rowsAffected > 0`, `false` otherwise — the same boolean contract as `assignChat`.
- Non-destructive guarantee: `clearChat` only nulls the chat's `category_id`. It performs **no**
  category deletion, **no** chat deletion, **no** metadata-row deletion, **no** snapshot/asset
  deletion, and **no** purge/hard-delete.
- A future `applyChatCategoryClearLibraryMetadataRequest` would: load the chat (reject if missing);
  if the chat already has no category → `skipped_duplicate`
  (`library-metadata-mutation-request-already-cleared-canonical`); else call `clearChat(chatId)` and,
  on `true`, return `applied`; on `false`, return `rejected`.
- Before/after assignment hashes computed as today, with the after-category hash empty (cleared).

## 6. Receipt Behavior (design)

Reuse receipt schema `h2o.studio.library-metadata-mutation-receipt.v1` and the Phase 7 status
taxonomy unchanged:

- `applied` — chat category cleared (category_id set to NULL).
- `skipped_duplicate` — chat already had no category, or an `applied` clear receipt already exists for
  the same `requestId`/`idempotencyKey`.
- `stale_basis` — request basis hash mismatched the current Desktop projection.
- `rejected` — target chat not found.
- `deferred` — Desktop store unavailable or basis unavailable.
- `invalid` — malformed/failed safety or privacy checks.

Receipts stay hash/status/count only: hashed target refs (`chatIdHash`, `entityIdHash` empty for a
clear), `beforeProjectionHash`, `resultingCanonicalHash`, before/after assignment hashes, and the
Phase 7 `privacy` + `safety` blocks. `separateFromDesktopCanonicalLibraryMetadata: true`,
`productSyncReady: false`.

## 7. Chrome Receipt Import / Resolution (design — no change needed)

Phase 8 `importLibraryMetadataMutationReceiptsFromDesktopBundle` already sanitizes any receipt by the
receipt schema + safety/privacy contract and matches it to pending requests by
`requestId`/`idempotencyKey` regardless of `requestType`. A `chat-category-clear` receipt would import
read-only and resolve its matching pending request in the read-model/outbox with **no Chrome
canonical mutation** — no Phase 8 code change is required. Terminal statuses (applied / rejected /
invalid / skipped_duplicate / stale_basis) flip the request off `pending`; `deferred` stays observed.

## 8. Canonical Export / Projection Refresh (design)

- Desktop canonical export (`desktopCanonicalLibraryMetadata`) reflects the clear: a successful clear
  **decrements** `chatCategoryAssignmentCount` (e.g. 1 → 0) and `classificationSignalCount`, and the
  `projection` hash changes (the projection derives chat→category bindings from `chat.category_id`).
- Chrome projection refresh sees the sanitized counts/hashes and display parity holds, exactly as for
  assign (Phases 3/5).
- `productSyncReady` remains `false` until a future phase runtime-proves the clear loop end to end
  (analogous to the Phase 9 proof for assign).

## 9. Acceptance Criteria & Validators a Future Implementation Phase Must Add

- A request validator (analogous to Phase 6) proving Chrome can shape/export a `chat-category-clear`
  request and that genuine destructive actions remain blocked by the exact-match carve-out.
- A Desktop apply/receipt validator (analogous to Phase 7) proving validate → `clearChat` apply →
  `applied`/`skipped_duplicate`/`stale_basis`/`rejected`/`deferred`/`invalid` receipts, with no
  deletion of any kind and the allowlist limited to `chat-category-assign` + `chat-category-clear`.
- A Chrome receipt/resolution check (reuse Phase 8) confirming read-only import + resolution.
- An end-to-end runtime proof (analogous to Phase 9) proving the full clear loop in-process through
  the real modules, including the canonical assignment-count **decrement** and idempotency
  (`skipped_duplicate` on replay).
- A status-surface update (Phase 10) adding `chat-category-clear` to `appliedRequestTypes` **only
  after** it is implemented and proven, and moving it out of `deferredDestructiveShapes`.
- A guard test asserting the exact-match carve-out does not unblock any other `*-clear`/`*-delete`
  action.

## Required Boundary Invariants (must continue to hold)

- Only chat-category-assign is applied (this phase enables nothing; clear stays design-only/deferred).
- Chrome remains request-only.
- Chrome remains read-only over canonical metadata.
- Desktop remains canonical authority.
- No Chrome canonical mutation.
- No Desktop canonical mutation beyond the Phase 7 chat-category-assign apply path.
- Destructive-shaped metadata actions remain blocked/deferred.
- No deletion of chats, snapshots, assets, labels, tags, categories, folders, or metadata.
- noHardDelete / noPurge / noChatDelete / noSnapshotDelete / noAssetDelete preserved.
- No WebDAV/cloud/relay transport.
- Product metadata sync is not broadly complete.

## Deferred Surface (explicitly not in scope)

- catalog create/rename
- label/tag binding
- classification-set
- destructive actions
- live-CDP capture
- WebDAV/cloud/relay

## Design Verdict

Design-only, not implemented. `chat-category-clear` is specified as a guarded, non-destructive
reassignment-to-none that reuses the proven `chat-category-assign` chain end to end, gated behind an
exact-match allowlist carve-out, mapping to the existing non-destructive
`H2O.Studio.store.categories.clearChat` store path (`category_id = NULL`). It remains deferred and
unapplied until a future implementation phase builds and runtime-proves it.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY. `chat-category-assign` remains the only runtime-proven, applied
metadata request type. The broader surface above remains deferred.

## Recommended Phase 13

Either implement `chat-category-clear` per this design as the next safe applied type — request export,
Desktop validate/apply via `clearChat`, receipt, Chrome resolution, projection decrement, status-
surface update, plus the Phase 6/7/8/9-analogous validators and a guard test for the carve-out — or,
if a live Chrome (port 9247) + Desktop peer become available, first promote the deferred live-CDP
capture into executed evidence for the existing `chat-category-assign` loop. Either path must remain
read-only on Chrome canonical metadata, must not add destructive actions, and must not add
WebDAV/cloud/relay transport.
