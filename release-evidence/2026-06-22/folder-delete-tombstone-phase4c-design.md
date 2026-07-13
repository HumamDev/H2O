# Phase 4C Design — Chrome Folder Delete *Request* / Desktop Review-Apply

Date: 2026-06-22
Status: **DESIGN ONLY — no code changed, nothing staged/committed.** Phase 4C of the folder-sync delete lifecycle. Phase 4A (empty soft delete) and 4B (folder-with-chats soft delete + restore-rebind, `4dffeee`) are closed. Governed by [ADR-0007](../../docs/decisions/ADR-0007-studio-canonical-organization-state-transport-adapters.md) (Desktop = canonical authority) and [ADR-0008](../../docs/decisions/ADR-0008-chrome-companion-desktop-professional-workspace-contract.md) (Chrome = companion, requests / Desktop applies).
Scope guard: Chrome folder delete **request** + Desktop review/apply only. No Chrome destructive apply, no hard delete/purge, no broad F10.8 relay/convergence activation, no WebDAV, no Labels/Categories, no release/signing, no s-file moves.

---

## 1. Current Substrate Audit

### What already exists for Chrome tombstone request/review
`store/tombstone-reviews.mv3.js` (Chrome, IndexedDB `h2o.studio.tombstone-reviews.mv3`, store `reviews`, 3.5k lines, **inert**):
- Review record schema `h2o.studio.tombstone-review.v1`; statuses `pending / ignored / rejected / superseded / resolved / accepted-later`; reviewable `recordKind` includes `folder` and `folderBinding`.
- Public API: **`createReview(record)`**, `listReviews`, `getReview`, `getByDedupeKey`, `markIgnored/markRejected/markAcceptedLater/markResolved`, `ingestBundleTombstones`, `previewApply`, **`applyReview`** (per header invariant, **never deletes Library records or mutates entity stores** — Chrome "apply" is review-bookkeeping/display only). Records can carry `remoteExportId` (transport linkage).
- **Gap:** it is oriented to Chrome *reviewing inbound* (Desktop-origin) tombstones. 4C needs the *outbound* direction (Chrome creates a delete **request**). `createReview` is reusable for this with a `classification:'delete-request'` / `origin:'chrome-request'` shape — no new store/table needed.

### What Desktop already exposes to apply a safe delete
- **`store.folders.softDeleteFolder(folderId)`** (4B; alias of `softDeleteEmptyFolder`, now non-empty-capable) — the authoritative safe path: protected/system/unfiled/local-review blockers, `already-tombstoned` guard, captures `recoverySnapshot.bindings[]`, unbinds chats to Unfiled via the safe F15 path, creates the folder tombstone. Plus `restoreFolder`, `bindChat/unbindChat`.
- `store.tombstones.{createTombstone,getTombstone,list,markRestored,validateTombstone}` (`sync_tombstones`, Migration v6) + `sync_maintenance_log` audit.
- Desktop review store `store/tombstone-reviews.tauri.js` (`sync_tombstone_reviews` table) with `INGEST/PREVIEW/DECISION/APPLY_DRY_RUN/APPLY_RESULT` schemas — **inert** ("does not ingest bundles automatically").

### Transport today
- The bundle can carry a `tombstones[]` array, but `folder-import.mv3.js` flags it `library-propagation-tombstones-deferred` (warn, no apply). A gated Chrome-side `tombstoneReviewIngest` exists. No outbound *request* section exists yet.

### Verdict: are existing APIs enough?
**Almost.** Reuse `tombstoneReviews.createReview` (Chrome request), `store.folders.softDeleteFolder` (Desktop apply), the Desktop review store + `sync_maintenance_log` (audit). The only genuinely new pieces are (a) a small **request record shape**, (b) a **request bundle section** Chrome→Desktop, and (c) a **status-only receipt** Desktop→Chrome. This is a justified minimal propagation — a *request* is non-destructive and a *receipt* is status-only; neither activates full tombstone-state replication or the F10.8 convergence/relay engine.

---

## 2. Proposed Phase 4C Flow

1. **Chrome user action** — folder action menu gains **"Request delete (review on Desktop)"** for mutable, Studio-owned folders. No destructive option in Chrome. The row optimistically shows a `deletion requested` pending badge; the folder stays visible until Desktop applies.
2. **Chrome request object** (`h2o.studio.folder-delete-request.v1`):
   ```
   { schema, requestId, recordKind:'folder', folderId,           // identity = folderId, never name
     folderNameAtRequest, normalizedNameAtRequest,               // advisory/display only
     requestedBy:'chrome-studio', requestedAt, sourcePeerId,     // no secrets
     status:'pending', reason:'user-requested-folder-delete',
     advisory:{ knownChatCountAtRequest, isCanonical, sourceKind } }  // Desktop re-checks authoritatively
   ```
3. **Where stored** — Chrome review store via `createReview({ classification:'delete-request', origin:'chrome-request', recordKind:'folder', status:'pending', payload:<request> })`; dedupe by `folderId` + pending.
4. **How Desktop detects/reviews** — the request travels in the Chrome→Desktop bundle (`chrome-latest.json`) as a new `folderDeleteRequests[]` section. Desktop import ingests it into `sync_tombstone_reviews` (status `pending`). Surfaced for review via a Desktop review list (console first, UI later). Desktop **re-validates authoritatively** (identity by `folderId`, protected/system/unfiled/local-review, current chat count) — Chrome's advisory counts are never trusted.
5. **How Desktop applies** — on approval, Desktop calls the existing **`store.folders.softDeleteFolder(folderId)`** (4B path → tombstone + chats→Unfiled + recoverySnapshot). No new delete logic.
6. **Result/receipt** — Desktop writes an apply-result (`h2o.studio.tombstone-review-apply-result.v1`) + `sync_maintenance_log` row, sets the review `applied` (with `resultingTombstoneId`) or `rejected` (with `resultCode`). A **status-only receipt** `{ requestId, status:'applied'|'rejected', resultCode, resultingTombstoneId?, appliedAt }` echoes back in the Desktop→Chrome bundle; Chrome `markResolved/markRejected`s the request and, on `applied`, **hides the folder via a targeted, debounced refresh** (no full-page flicker — reuse Phase 3 smoothing).

```
Chrome: createReview(delete-request, pending)  ──folderDeleteRequests[]──▶  Desktop: ingest → review → approve
                                                                                   │
                                                            softDeleteFolder(folderId) [4B safe path]
                                                                                   │
Chrome: markResolved + hide folder  ◀──receipt{requestId,status}──  apply-result + sync_maintenance_log
```

---

## 3. Safety Invariants

- **Chrome cannot hard-delete** — Chrome has no destructive folder API; `createReview`/`markX` are bookkeeping; `applyReview` is non-mutating by store contract.
- **Chrome cannot bypass Desktop approval** — a request is inert `pending` until Desktop applies; `softDeleteFolder` runs only on Desktop.
- **Chats never deleted** — Desktop apply reuses the 4B path (unbind to Unfiled, snapshot bindings); no chat row touched.
- **Protected folders blocked** — Desktop re-validates with authoritative blockers (`protected-folder/system-folder/unfiled-folder/local-review-folder-not-editable`); a request for one is `rejected`, never silently applied.
- **Identity by `folderId`, not name** — request targets a `folderId`; name reuse / duplicates are irrelevant; a `folderId` Desktop doesn't own → `rejected: folder-identity-missing` / `folder-not-owned-by-desktop` (the ADR-0007 ownership boundary).
- **Moved-chat restore behavior preserved** — apply/restore go through the unchanged 4B `softDeleteFolder`/`restoreFolder`, so unbind-to-Unfiled + restore-rebind-eligible + `restore-binding-skipped-rebound` semantics are inherited verbatim.
- **Idempotent** — request dedupe by `folderId`+pending; apply guarded by `already-tombstoned`; receipt application idempotent (`markResolved` no-op if resolved).
- **No broad F10.8 activation** — only `tombstoneReviews.createReview/list/markX`, `folders.softDeleteFolder`, the Desktop review store, and the request/receipt bundle sections are touched. Convergence/relay/proposal modules stay inert.

---

## 4. Minimal Implementation Slices

- **4C.1 — Request adapter / audit (no behavior change):** define `h2o.studio.folder-delete-request.v1`; confirm `tombstoneReviews.createReview` accepts the `delete-request` classification; add a thin `requestFolderDelete(folderId)` wrapper (Chrome) and request-list/dedupe helpers. No UI, no transport.
- **4C.2 — Chrome request creation UI/API (Chrome-local, no transport, no destruction):** Chrome folder menu "Request delete (review on Desktop)" for mutable Studio-owned rows → `actions.folders.requestDelete(folderId)` → `createReview(...)`; optimistic `deletion requested` row badge; status reflected in Sync Health. **This is the smallest safe first slice — fully non-destructive.**
- **4C.3 — Desktop review/apply + transport:** add `folderDeleteRequests[]` to the Chrome→Desktop bundle; Desktop ingest → `sync_tombstone_reviews`; Desktop review list + approve → `softDeleteFolder`; apply-result + `sync_maintenance_log`; status-only receipt Desktop→Chrome; Chrome reflects (resolve + hide via targeted refresh).
- **4C.4 — Runtime proof + evidence:** console + UI round-trip, negative tests, evidence note.

---

## 5. Exact Files Likely to Change

- `store/tombstone-reviews.mv3.js` — `requestFolderDelete`/classification + dedupe + status helpers (thin over `createReview`).
- `S0F3b. 🎬 Folders Actions - Studio.js` — `actions.folders.requestDelete(folderId)` (Chrome) wrapper.
- `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` — Chrome "Request delete" menu action for mutable rows; `deletion requested` pending badge; targeted/debounced refresh on receipt; (Desktop) optional review-approve affordance.
- `sync/auto-import.mv3.js` — Chrome→Desktop exporter: add `folderDeleteRequests[]` section.
- `sync/folder-import.mv3.js` — Chrome receipt ingest (mark request resolved/rejected, hide folder) + Sync Health `deleteRequest*` fields.
- `sync/folder-sync.tauri.js` — Desktop: import requests, surface review, apply via `softDeleteFolder`, write receipt + health fields.
- `store/tombstone-reviews.tauri.js` — Desktop ingest of folder delete requests + apply-result.
- `store/folders.tauri.js` — (reuse `softDeleteFolder`) optional thin `applyReviewedFolderDelete(requestId)` that records the request linkage on the tombstone.
- `ingestion/export-bundle.tauri.js` — Desktop→Chrome status receipt section.
- **No** Rust/migration change (reuse `sync_tombstones` + `sync_tombstone_reviews`); **no** Labels/Categories/WebDAV.

---

## 6. Validation Plan

**Static validators**
- `node --check` on every edited file.
- New `tools/validation/sync/validate-folder-delete-request-phase4c.mjs`.

**Runtime console proof (round-trip)**
- Chrome: `actions.folders.requestDelete('<folderId>')` → review `pending`; folder shows `deletion requested`.
- (4C.3) export → Desktop import → Desktop review list shows the request → approve → `softDeleteFolder` applied → `sync_tombstones` row created, chats → Unfiled, `recoverySnapshot.bindings[]` captured → apply-result + `sync_maintenance_log` → receipt → Chrome `markResolved` + folder hidden (no flicker).
- Restore on Desktop (`restoreFolder`) re-binds eligible chats (inherited 4B), skip-rebound preserved.

**Negative tests**
- Chrome has **no** path that deletes a folder/chat directly (assert absence of destructive Chrome API; `applyReview` does not mutate entity stores).
- Request for protected/system/unfiled/local-review folder → Desktop `rejected` with the precise code, **never** applied.
- Request for a `folderId` Desktop doesn't own → `rejected: folder-identity-missing`/`folder-not-owned-by-desktop`.
- Stale/duplicate request (folder already tombstoned/renamed) → idempotent resolve, no double tombstone.
- Duplicate folder name → request resolves by `folderId`, unaffected by name.
- Assert **no chat row and no snapshot row deleted** across the whole flow.
- Assert auto-export does not propagate the resulting tombstone as a destructive apply (receipt is status-only).

---

## 7. Recommendation

**Split into slices — do not implement 4C in one prompt.** The Chrome-local request and the Desktop apply+transport have very different risk profiles; coupling them in one prompt risks a half-wired transport touching the destructive path.

**Smallest safe first Codex prompt = 4C.1 + 4C.2 (Chrome-local request only):**
> In `h2o-cp-source/src-surfaces-base/studio` (Chrome/MV3 only), let a Chrome user **request** folder deletion without any destructive action or transport. Define `h2o.studio.folder-delete-request.v1` and add a thin `requestFolderDelete(folderId)` over the existing `H2O.Studio.store.tombstoneReviews.createReview` (classification `delete-request`, origin `chrome-request`, recordKind `folder`, status `pending`), deduped by `folderId`+pending, identity by `folderId` (never name). Expose `H2O.Studio.actions.folders.requestDelete(folderId)` and a Chrome folder-menu action **"Request delete (review on Desktop)"** for mutable Studio-owned rows only (gate protected/system/unfiled/local-review out of the menu with reasons; never reach a native round-trip). Show an optimistic `deletion requested` badge and reflect a pending count in Sync Health. **No transport, no Desktop apply, no folder/chat mutation, no tombstone** in this slice. Add `validate-folder-delete-request-phase4c.mjs` asserting: a request record is created `pending`; no folder/chat/tombstone is mutated; protected/unfiled folders cannot be requested; dedupe works; and Chrome exposes no destructive folder-delete API. `node --check` all edited files.

Then 4C.3 (Desktop review/apply + transport) and 4C.4 (proof) as separate prompts. This keeps every destructive operation on Desktop behind the proven 4B path and lets the request UX ship risk-free first.

---

## Final note

4C is a wiring exercise over inert, already-built substrate: Chrome's review store (`createReview`), Desktop's authoritative `softDeleteFolder`, the Desktop review store, and `sync_maintenance_log`. The only new surface is a small non-destructive **request** record + a status-only **receipt** — a justified, minimal propagation that does not activate full tombstone replication or the F10.8 engine. Ship the Chrome-local request first; gate every destructive apply behind Desktop's existing safe path.
