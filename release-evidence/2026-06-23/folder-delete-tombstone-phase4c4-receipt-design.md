# Phase 4C.4 Design — Status-Only Receipt Desktop → Chrome (after Desktop applies a Chrome folder delete request)

Date: 2026-06-23
Status: **DESIGN ONLY — no code changed, nothing staged/committed.** Closes the last deferred leg of the Chrome-request / Desktop-apply loop (4A/4B/4C.1/4C.2/4C.3a/4C.3b closed). Governed by [ADR-0007](../../docs/decisions/ADR-0007-studio-canonical-organization-state-transport-adapters.md) (Desktop = authority) and [ADR-0008](../../docs/decisions/ADR-0008-chrome-companion-desktop-professional-workspace-contract.md) (Chrome = companion).
Scope guard: status-only receipt + Chrome mark-resolved + Chrome visible-folder hide. **No real tombstone propagation, no Chrome tombstone apply, no chat/snapshot mutation, no hard delete/purge, no WebDAV, no Labels/Categories, no broad F10.8.** No s-file moves.

---

## 1. Current Substrate Audit

### How Desktop records the applied request result (4C.3b — already done)
`tombstoneReviews.applyFolderDeleteRequest(...)` → calls the safe `store.folders.softDeleteFolder` and writes, on the `sync_tombstone_reviews` row:
- `status:"resolved"`, `decision:"applied-folder-delete-request"`, `decided_at`, `decided_by_sync_peer_id`.
- A `desktopApplyResult` block in the raw request JSON: `appliedAt`, `appliedBySurface:"desktop-studio"`, `tombstoneId`, `folderId`, `affectedChatCount`, `bindingCount`, `noHardDelete:true`, `noChatDelete:true`, **`chromeReceiptDeferred:true`**, `tombstonePropagation:"deferred"`.
- Apply-result schema `h2o.studio.tombstone-review-apply-result.v1`, phase `phase4c.3b`, `requestApplyOnly:true`, `mutationType:"folder.softDelete"`.

**→ The entire receipt payload already exists.** 4C.4 only projects it status-only and ships it back.

### Can Desktop export include status-only receipts?
Yes. The Desktop→Chrome `latest.json` is built by `ingestion/export-bundle.tauri.js` (`buildFolderState` → `bundle.folderState`, plus other sections; runs on Desktop so it can read `H2O.Studio.store.tombstoneReviews`). It mirrors the request transport, which already added `bundle.folderDeleteRequests[]` in the Chrome→Desktop direction. A symmetric `bundle.folderDeleteReceipts[]` is the natural home. **Note:** a soft-deleted folder is already absent from `bundle.folderState.folders` (the SQLite list hides tombstoned folders), but Chrome's import merge is **never-prune**, so the folder would otherwise linger in Chrome — the receipt is the explicit, safe hide signal.

### Can Chrome review store ingest / mark a request resolved?
Yes. `store/tombstone-reviews.mv3.js` exposes `getReview/getByDedupeKey/listReviews` and **`markResolved` / `markRejected`** (and `applyReview`, which by store contract **never mutates entity stores**). So Chrome can match the receipt to its local pending request and resolve it without any destructive apply.

### How can Chrome hide the folder without a local destructive apply?
Chrome renders from its visible folder-state mirror `FOLDER_STATE_KEY_LOCAL` (written by `folder-import.mv3.importLatestBundle`). Hiding = **remove the `folderId` from that mirror** (drop `folderState.folders[folderId]` + `folderState.items[folderId]`) and run the existing **targeted, debounced folder refresh** (`targeted-folder-refresh` / `duplicate-suppressed` modes already in `folder-import.mv3`). This is a visibility edit only: no tombstone is created on Chrome, no chat/snapshot/binding row is touched, and it is reversible.

### Verdict
**Pure wiring.** Reuse `desktopApplyResult` (receipt source), the `bundle.folderDeleteRequests[]` transport pattern (now in reverse), `markResolved` (Chrome), and the existing targeted-refresh mirror edit. No new store, no migration, no tombstone propagation.

---

## 2. Proposed 4C.4 Flow

```
Desktop (resolved review + desktopApplyResult)
        │  4C.4a: project status-only → bundle.folderDeleteReceipts[]  (latest.json)
        ▼
Chrome importLatestBundle
        │  4C.4b: match receipt → local pending request (by requestId + folderId) → markResolved
        │  4C.4c: remove folderId from FOLDER_STATE_KEY_LOCAL mirror → targeted refresh (folder disappears)
        ▼
Chrome: request resolved, folder hidden. No tombstone created. No chats/snapshots touched.
```

1. **Desktop exports receipt** — for each `sync_tombstone_reviews` row that is `resolved` + `decision:applied-folder-delete-request` (or a `rejected` decision), emit a status-only receipt into `bundle.folderDeleteReceipts[]` on the next `latest.json` export (debounced; only un-acknowledged receipts).
2. **Chrome imports receipt** — `importLatestBundle` reads `bundle.folderDeleteReceipts[]`.
3. **Chrome marks request resolved** — validate the receipt against a local pending request (same `requestId`/`reviewId` and `folderId`); on match, `markResolved` (applied) or `markRejected` (rejected) the Chrome request record.
4. **Chrome hides folder** — **only on `applied`** and only after the match validates: remove `folderId` from `FOLDER_STATE_KEY_LOCAL`, targeted refresh. On `rejected`, clear the pending badge and **do not hide** (folder stays).
5. **Chrome does not** create an applied tombstone, mutate chats/snapshots/bindings, or hard-delete.

---

## 3. Receipt Object Shape

`h2o.studio.folder-delete-receipt.v1` (status-only projection of `desktopApplyResult`):
```
{
  schema: 'h2o.studio.folder-delete-receipt.v1',
  receiptId,                       // stable; e.g. 'folder-delete-receipt:<requestUuid>'
  requestId,                       // 'folder-delete-request:...'  (match key)
  reviewId,                        // = requestId on Desktop
  folderId,                        // identity — match key (never name)
  decision: 'applied-folder-delete-request' | 'rejected-folder-delete-request',
  status:   'applied' | 'rejected',
  appliedAt,                       // from desktopApplyResult.appliedAt
  appliedBySurface: 'desktop-studio',
  appliedBySyncPeerId,             // decided_by_sync_peer_id (no secrets)
  tombstoneId,                     // OPTIONAL reference string only (not the tombstone payload)
  resultCode,                      // on reject: 'protected-folder' | 'already-tombstoned' | ...
  noHardDelete: true,
  noChatDelete: true,
  tombstonePropagation: 'deferred',
  chromeAction: 'hide-folder' | 'none',   // applied → hide-folder ; rejected → none
}
```
- **`tombstoneId` is a reference only** — carrying the id is safe and aids idempotency/audit; it is NOT the tombstone record and Chrome never applies it.
- Status-only: no `recoverySnapshot`, no bindings, no chat ids, no folder content. Redacted (folderId hash acceptable in diagnostics).

---

## 4. Safety Invariants

- **Status-only; no raw tombstone apply on Chrome** — Chrome consumes a receipt, not a tombstone; `applyReview` is non-mutating by store contract; no `createTombstone` on Chrome.
- **No chat/snapshot/binding deletion** — Chrome only edits `FOLDER_STATE_KEY_LOCAL` visibility; Desktop already did the only mutation (soft delete via 4B `softDeleteFolder`).
- **Idempotent repeated receipt import** — keyed by `requestId`; if the local request is already `resolved`/hidden, re-import is a no-op (re-hide no-op; `markResolved` no-op).
- **Duplicate folder names irrelevant; identity by `folderId`** — match is `requestId` + `folderId`; name reuse cannot cause a wrong-folder hide.
- **Stale / mismatched receipt blocked** — receipt `folderId` ≠ local request `folderId` → `receipt-folder-mismatch` (no hide). No matching local pending/approved request → `receipt-no-matching-request` (record only, **no hide**). Request already withdrawn/rejected locally → no hide.
- **Chrome hides only after a matching pending request validates** — a forged/stray receipt for a folder Chrome never requested can never hide it. Hide requires `status:applied` AND a local request match.
- **Reversibility** — hide is a mirror visibility edit; nothing is destroyed. (Restore-receipt — re-showing after a Desktop restore — is out of 4C.4 scope and deferred; a restored folder reappears via a later restore-receipt phase.)

---

## 5. Minimal Implementation Slices

- **4C.4a — Desktop receipt export only.** Add `bundle.folderDeleteReceipts[]` to the Desktop `latest.json` export, projected status-only from resolved `applied`/`rejected` reviews (un-acknowledged only). **No Chrome change.** Pure additive, fully reversible.
- **4C.4b — Chrome receipt import + mark resolved.** `importLatestBundle` consumes receipts, validates against local pending requests, `markResolved`/`markRejected`. **No hide yet** (folder stays visible; request shows resolved).
- **4C.4c — Chrome visible-state hide after receipt.** On validated `applied` receipt, remove `folderId` from `FOLDER_STATE_KEY_LOCAL` + targeted/debounced refresh. The only user-visible change; non-destructive.
- **4C.4d — Runtime proof + evidence.** Round-trip + negative tests + evidence note.

---

## 6. Exact Files Likely to Change

- `ingestion/export-bundle.tauri.js` — build `bundle.folderDeleteReceipts[]` from resolved reviews (4C.4a).
- `store/tombstone-reviews.tauri.js` — a `collectAppliedFolderDeleteReceipts(...)` / `listFolderDeleteReceipts(...)` projection helper + optional `acknowledged` marker so receipts aren't re-emitted forever (4C.4a).
- `sync/folder-sync.tauri.js` — preserve `folderDeleteReceipts[]` through the Desktop→Chrome export path/sanitizer; receipt-export diagnostics + Sync Health `deleteReceiptExport*` fields (4C.4a).
- `sync/auto-export.tauri.js` — only if a receipt-driven export trigger/debounce is needed (4C.4a).
- `sync/folder-import.mv3.js` — consume `bundle.folderDeleteReceipts[]`, validate + `markResolved` (4C.4b), then remove `folderId` from `FOLDER_STATE_KEY_LOCAL` + targeted refresh (4C.4c); Sync Health `deleteReceiptImport*` / `hiddenAfterReceipt*` fields.
- `store/tombstone-reviews.mv3.js` — thin `applyFolderDeleteReceipt(receipt)` over existing `markResolved`/`markRejected` with match/dedupe (4C.4b).
- `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` — clear the Chrome `deletion requested` badge on resolve; ensure the folder-row removal uses the targeted refresh (no full-page flicker) (4C.4c).
- `S0F3b. 🎬 Folders Actions - Studio.js` — only if a Chrome-side `actions.folders` resolve/hide hook is cleaner than doing it in the importer.
- **No** Rust/migration change; **no** `store/tombstones.*` change; **no** Labels/Categories/WebDAV.

---

## 7. Validation Plan

**Static validators**
- `node --check` on every edited file.
- Extend `tools/validation/sync/validate-folder-delete-request-phase4c.mjs` or add `validate-folder-delete-receipt-phase4c4.mjs`.

**Runtime proof (round-trip, reuse the 4C.3b fixture folder)**
- Desktop apply (4C.3b) → Desktop export `latest.json` contains `folderDeleteReceipts[]` with `schema:h2o.studio.folder-delete-receipt.v1`, matching `requestId`/`folderId`, `status:applied`, `tombstoneId` present, `noHardDelete/noChatDelete:true`.
- Chrome import → local request `markResolved` (status applied) → folder removed from `FOLDER_STATE_KEY_LOCAL` → sidebar row disappears via targeted refresh (no full-page flicker).
- Assert Chrome created **no** tombstone, and chat/snapshot counts unchanged.

**Negative tests**
- **Receipt for a folder Chrome never requested** → `receipt-no-matching-request`; folder **not** hidden.
- **Receipt `folderId` ≠ local request `folderId`** → `receipt-folder-mismatch`; no hide.
- **`rejected` receipt** → pending badge cleared, folder **stays visible**, no hide.
- **Idempotent re-import** → second import is a no-op (no duplicate hide, request stays resolved).
- **Chrome has no destructive folder/chat API** invoked by receipt handling (assert `applyReview` does not mutate entity stores; no `createTombstone` on Chrome).
- **Duplicate folder name** present in Chrome → only the `folderId`-matched row hides; the same-named other folder stays.

---

## 8. Recommendation

**Split — do not implement 4C.4 in one prompt.** The three slices have rising risk: 4C.4a is a pure additive export (zero behavior change), 4C.4b adds inert review bookkeeping, 4C.4c is the only user-visible mutation (folder disappears). Coupling them risks a half-validated hide path.

**Smallest safe first Codex prompt = 4C.4a (Desktop receipt export only):**
> In `h2o-cp-source/src-surfaces-base/studio`, on the Desktop `latest.json` export (`ingestion/export-bundle.tauri.js`, with a helper in `store/tombstone-reviews.tauri.js`), add a status-only `bundle.folderDeleteReceipts[]` section projected from `sync_tombstone_reviews` rows that are `resolved` with `decision:applied-folder-delete-request` (and `rejected` decisions), using schema `h2o.studio.folder-delete-receipt.v1` with `{ requestId, reviewId, folderId, decision, status, appliedAt, appliedBySurface, appliedBySyncPeerId, tombstoneId?, resultCode?, noHardDelete:true, noChatDelete:true, tombstonePropagation:'deferred', chromeAction }`. Emit only un-acknowledged receipts (add an `acknowledged`/`receiptExportedAt` marker so they aren't re-emitted forever). **Change nothing on Chrome; apply nothing; mutate no folder/chat/tombstone.** Preserve the section through `sync/folder-sync.tauri.js`'s Desktop→Chrome export path and add receipt-export diagnostics + a Sync Health `deleteReceiptExport` block. Add/extend a validator asserting the receipt section is present and status-only, that no destructive mutation occurs, and that receipts are idempotent/de-duplicated across repeat exports. `node --check` all edited files.

Then **4C.4b** (Chrome import + `markResolved`, no hide) and **4C.4c** (Chrome `FOLDER_STATE_KEY_LOCAL` hide + targeted refresh) as separate prompts, with **4C.4c last** since it is the only user-visible change. 4C.4d closes with the runtime round-trip + evidence.

---

## Final note

4C.4 is the smallest remaining leg: the receipt payload already lives in `desktopApplyResult`, the reverse-direction transport mirrors the proven `folderDeleteRequests[]` pattern, Chrome's `markResolved` and targeted-refresh mirror edit already exist, and the hide is a reversible visibility change — not a tombstone apply. Ship the Desktop export first (risk-free), then Chrome resolve, then the user-visible hide, keeping every destructive operation on Desktop behind the proven `softDeleteFolder` path.
