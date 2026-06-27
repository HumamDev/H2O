# Main Chrome Save-to-Folder / Archive Action Integration — E.0 Plan

Date: 2026-06-24

Status: E.0 PLANNED - NOT IMPLEMENTED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/plan-only note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes.

## Summary Of Phase D Closure

Phase D is closed (`f8becb6 docs(studio): close saved chat archive phase d`) and
proved the full path end-to-end on a real Chrome + Desktop setup:

```text
Chrome metadata-only request -> Desktop inbox -> D.2B queue (validated) ->
D.2C materializer (written) -> package validation OK -> archive diagnostics OK ->
idempotent already-written
```

The proven Chrome-side entry point is the shipped delivery API
`H2O.Studio.ingestion.deliverSavedChatArchiveRequestV1({ confirmDelivery, builderOptions })`,
exercised so far only through the Settings -> Diagnostics "Archive Request
Delivery" card (manual test/proof path). E.0 plans how the **real, user-facing
Save-to-Folder / archive action** should use that same proven path instead of the
manual test/proof path — without reopening Phase D and without making Chrome
authoritative.

Do not reopen Phase D unless a validation failure appears.

## Target Product Workflow

When a user saves a chat to a folder in Chrome Studio (the existing Save-to-Folder
action), the product should — opt-in and flag-gated — emit a metadata-only
archive request through the proven delivery path, so the saved chat is also
materialized into a Desktop archive package. The user experiences a single
"save" action; the archive request is a quiet companion of a successful
Save-to-Folder, not a new button or a separate workflow.

## Proposed User Flow

1. User performs the existing Save-to-Folder action on a chat (real saved chat,
   which yields a Desktop snapshot through the existing capture pipeline).
2. On success, if the archive-on-save flag is enabled and the archive request
   folder is connected, Chrome delivers one metadata-only request pointing at the
   saved chat's resolution ids.
3. Chrome shows a quiet, plain-language status near the save affordance
   (for example "Saved to your archive" or "Saved — archiving pending Desktop").
4. The user may optionally re-check archive status later; status read-back stays
   manual (no polling).

Add-to-Library is intentionally excluded (see below).

## Data / Resolution Flow

- Chrome reads the saved chat's identity from the row it just saved
  (`H2O.LibraryIndex.getAll()` rows / the Save-to-Folder result), which carry
  `chatId` / `conversationId` and `snapshotId` / `lastSnapshotId` /
  `latestSnapshotId`.
- Chrome passes its best-known ids in `desktopResolution.studioChatId` and
  `desktopResolution.snapshotId`; it never invents a snapshotId and never sends
  transcript/content.
- Desktop remains the resolver of record: it re-resolves the canonical
  `studioChatId` / `snapshotId` through its store and decides `validated` vs
  `needs-desktop-snapshot`. Chrome ids are hints, not authority.
- The request stays metadata-only (`payloadPolicy` false/false), enforced by the
  builder and re-asserted by the delivery module.

### Answers To Resolution Questions

- **(Q3) How Chrome obtains the ids:** from the Chrome library row produced by the
  save (chat id + snapshot id fields above). Best-known hints only.
- **(Q4) If Chrome does not know a Desktop snapshot yet:** deliver with whatever
  ids it has (or none); accept a `needs-desktop-snapshot` receipt and present it
  as a benign pending state, not an error. No Chrome-side snapshot creation.
- **(Q5) First integration — create a Desktop snapshot first, or deliver-only?**
  **Deliver-only.** The first product slice keeps Chrome intent-only and accepts
  `needs-desktop-snapshot` as a valid outcome. Save-to-Folder already produces a
  snapshot via the existing capture pipeline; Desktop snapshot creation is a
  separate, later concern and is out of scope for E.

## Failure / Status Handling

Receipt statuses are mapped to plain product language (no proof/debug terms):

| Receipt outcome | Product message |
|---|---|
| `queued-on-desktop` | Saved to your archive |
| `already-queued-duplicate` | Already in your archive |
| `needs-desktop-snapshot` | Saved — will archive once opened in Desktop |
| `delivered-awaiting-desktop` | Saved — archiving pending Desktop |
| `db-unavailable` | Desktop unavailable — will archive later |
| `rejected-by-desktop` | Couldn't archive (see Settings -> Diagnostics) |
| folder not connected / FSA unavailable | Connect an archive folder in Settings -> Diagnostics |

Read-back stays manual and informational; the Desktop queue remains
authoritative. No polling, no watcher, no automatic background read.

## UI Placement Rules

- No temporary/global floating buttons and no app-wide overlays.
- Proof/debug controls (Connect folder, Send test request, Check receipt, raw
  ids/receipt JSON, any manual envelope override) stay **only** inside
  Settings -> Diagnostics -> Archive Request Delivery card.
- The product flow surfaces a quiet inline status within the existing
  Save-to-Folder confirmation/row affordance — never a separate overlay.
- Product strings avoid proof/debug language: no "test request", "envelope",
  "dedupeKey", "receipt", "inbox", or phase labels in user-visible copy.

### Answers To UI Questions

- **(Q1) Trigger:** the existing Save-to-Folder action (`saveToFolder` /
  `save-to-folder` in Library Actions Core), as a companion of a successful save —
  not a new button.
- **(Q2) Difference from Add-to-Library:** Add-to-Library is a lightweight
  link/registry entry that need not have a snapshot; Save-to-Folder yields a saved
  chat with a snapshot Desktop can materialize. Archive delivery is gated on
  Save-to-Folder / saved rows with snapshot evidence and is **skipped for
  link-only Add-to-Library rows**.
- **(Q6) Status display:** the plain-language mapping above, shown inline.
- **(Q7) Avoiding proof/debug language:** product copy uses "archive" / "Saved to
  your archive" / "pending Desktop"; technical terms remain in Diagnostics only.
- **(Q8) Diagnostics-only:** folder connection management, the test request, the
  receipt check, and any raw ids/JSON stay in the Archive Request Delivery
  Diagnostics card.

## Out Of Scope (Restated)

- No auto-materialization (materialization stays Desktop-triggered).
- No sync/WebDAV/cloud transport.
- No import/recovery.
- No native messaging, no localhost relay.
- No repair/delete/overwrite/retry policy.
- No Chrome package, CAS, SQLite, or `contentHash` writes.
- No transcript/messages/html/assets as authoritative package content.
- No Archive Health UI mutation.
- No temporary/global floating buttons or app-wide overlays.

## Implementation Slices

- **E.0 (this note):** docs-only plan.
- **E.1 — archive-on-save companion hook (smallest slice):** a flag-gated,
  default-OFF, opt-in hook on a successful Save-to-Folder that calls
  `deliverSavedChatArchiveRequestV1({ confirmDelivery: true, builderOptions: { desktopResolution: { studioChatId, snapshotId } } })`
  with ids read from the just-saved row, requires the archive folder to already be
  connected (via the Diagnostics card), and shows a quiet inline status. No new
  product button; deliver-only; `needs-desktop-snapshot` accepted. Add a focused
  validator.
- **E.2 — inline status read-back (optional):** a manual, opt-in "check archive
  status" affordance on the saved row, reusing `readSavedChatArchiveRequestReceiptV1`,
  mapped to product language.
- **E.3 — first-run / folder-connection onboarding (optional):** guide the user to
  connect the archive folder from the save flow (still gesture-bound, still
  Diagnostics-owned connection), no new transport.
- **E.4 — runtime smoke + evidence; E.5 — closure.**

## Files Likely Touched Later (Not In E.0)

- `src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js`
  (Save-to-Folder companion hook) — or a thin new product adapter module that the
  action calls.
- A new focused validator under `tools/validation/studio/`.
- Possibly `src-surfaces-base/studio/studio.html` + `tools/product/studio/pack-studio.mjs`
  if a new product adapter module is added (hunk-staged).
- A feature-flag definition for archive-on-save (default OFF).

## Files That Must Not Be Touched

- Delivery module and its UI
  (`saved-chat-archive-request-delivery.mv3.js`,
  `saved-chat-archive-request-delivery-ui.studio.js`) — reuse the shipped APIs;
  do not change unless a real blocker appears.
- Desktop inbox scanner, queue, materializer, package writer/projector, asset
  CAS, store adapters, archive diagnostics, Archive Health UI.
- Tauri capabilities, `lib.rs`, sync files, import/recovery, WebDAV/cloud,
  user-folder export/save-dialog.

## Validation Strategy

- E.0: docs-only — `git diff --check` and `git diff --cached --check`.
- E.1+: focused validator asserting the companion hook is flag-gated and OFF by
  default, gated on Save-to-Folder (not Add-to-Library), passes only resolution
  ids (no transcript/content/contentHash), uses product (non-debug) strings,
  adds no app-wide floating button, and calls only `deliverSavedChatArchiveRequestV1`
  (no enqueue/materialize/package/CAS/store). Plus the D.3C delivery runtime and
  UI validators must keep passing.

## Commit Strategy

- E.0: a single docs-only commit (`docs(studio): plan main saved chat archive action`).
- E.1+: per-slice, docs-first where a contract is warranted; hunk-stage the
  Library Actions Core file and any monolith; feature commits like
  `feat(studio): archive on save-to-folder`; evidence/closure as docs commits.

## Outcome

E.0 is PLANNED - NOT IMPLEMENTED. The product integration reuses the proven
Phase D delivery path, keeps Chrome intent-only and Desktop authoritative, hides
all proof/debug controls in Settings -> Diagnostics, and starts from a minimal,
flag-gated, deliver-only companion hook on Save-to-Folder.

Recommended next implementation step: E.1 — the flag-gated, default-OFF
archive-on-save companion hook (deliver-only) plus a focused validator.

Do not implement yet.
