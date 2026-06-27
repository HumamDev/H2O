# Main Chrome Save-to-Folder Archive Companion Hook — E.1.0 Contract

Date: 2026-06-24

Status: E.1.0 CONTRACT - NOT IMPLEMENTED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/contract-only note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes. It locks the runtime wiring contract before
the `S0F0j. 🎬 Library Actions Core - Studio.js` monolith is touched in E.1.1.

Predecessors:

```text
f8becb6 docs(studio): close saved chat archive phase d
5be1e0d docs(studio): plan main saved chat archive action   (E.0)
```

## 1. Feature Scope

- E.1 is a quiet archive-delivery **companion** to a successful Chrome Studio
  Save-to-Folder action.
- E.1 is **not** a new primary button.
- E.1 is **not** Add-to-Library.
- E.1 is **not** main package materialization.
- E.1 is **deliver-only** (it calls the proven Phase D delivery API; Desktop owns
  validation, queue, materialization, and durable state).

## 2. Feature Flag

The repo flag convention is dotted/namespaced keys read through
`H2O.flags.get(key, false)` (existing examples: `sync.chromeAutoImport`,
`sync.chromeAutoImport.eventTrigger`, `sync.desktopImportOnFocus`).

Recommended key (matches convention):

```text
archive.deliverOnSaveToFolder   (default OFF)
```

(The E.0-suggested camelCase `savedChatArchiveDeliveryOnSaveEnabled` is recorded
as an alternative, but the dotted `archive.deliverOnSaveToFolder` is preferred to
match the existing `H2O.flags` style.)

Flag behavior:

- Default OFF in production.
- If OFF, Save-to-Folder behavior remains unchanged (no archive delivery, no-op).
- If ON, a successful Save-to-Folder may attempt archive-request delivery.
- No background delivery if the archive request folder is not connected; the hook
  exits quietly with a "connect folder" reason and never blocks the save.

## 3. Trigger Point

- Trigger only **after** a Save-to-Folder action succeeds.
- Do not trigger on Add-to-Library.
- Do not trigger on a failed Save-to-Folder.
- Do not trigger from Settings test/proof controls (the Diagnostics card).
- Do not trigger from Archive Health UI.
- The hook is best-effort and must never block, delay, or fail the underlying
  Save-to-Folder result.

## 4. Gating Predicate

Archive delivery may run only when all of:

- the current surface is Chrome Studio / MV3, not Desktop/Tauri
  (bail if `__TAURI_INTERNALS__` / `__TAURI__` present);
- `H2O.Studio.ingestion.deliverSavedChatArchiveRequestV1` exists;
- the flag `archive.deliverOnSaveToFolder` is ON;
- the archive request folder is connected and permission is available
  (per the delivery diagnostics; do not silently prompt outside a gesture);
- the saved row/result carries enough identity hints: `studioChatId` and
  preferably `snapshotId`;
- the row is saved / snapshot-backed, not link-only (Add-to-Library link rows are
  excluded);
- `payloadPolicy` remains false/false (metadata-only).

If `snapshotId` is missing:

- per E.0 (deliver-only), delivery is still acceptable: deliver with the known
  ids and let Desktop return `needs-desktop-snapshot`, surfaced as a benign
  pending reason; or skip and show the pending reason. Either is allowed in E.1.
- do not create a Desktop snapshot from Chrome in E.1.

## 5. Request Construction

Use the proven Phase D entry point:

```text
deliverSavedChatArchiveRequestV1({ confirmDelivery: true, builderOptions })
```

`builderOptions` should include (all metadata-only):

- `source.surface = 'chrome-studio'`
- `source.href`
- `source.title`
- `source.nativeConversationId` (if available)
- `source.capturedAt`
- `source.messageCount` (if available)
- `intent.kind = 'save-to-folder'`
- `intent.target` folder / category / project / label / tag hints from the
  Save-to-Folder result (if available)
- `desktopResolution.studioChatId`
- `desktopResolution.snapshotId` (if available)
- `desktopResolution.requireExistingDesktopSnapshot = true`

Must NOT include (the builder already strips these; the hook must not add them):

- transcript
- messages
- HTML / outerHTML
- markdown
- assets
- images
- blobs
- package paths
- CAS paths
- contentHash
- package content

## 6. Status UX

Use product language, not proof/debug language:

| Delivery / receipt outcome | Product message |
|---|---|
| `delivered` | Archive request sent to Desktop |
| `delivered-awaiting-desktop` | Waiting for Desktop to process |
| `queued-on-desktop` / `validated` | Saved to Desktop archive queue |
| `already-queued-duplicate` | Already queued on Desktop |
| `needs-desktop-snapshot` | Desktop snapshot needed |
| `rejected-by-desktop` / `rejected` | Archive request rejected |
| `db-unavailable` | Desktop database unavailable |
| folder not connected | Connect archive folder in Settings |
| permission denied | Archive folder permission needed |

Raw debug labels (envelope, dedupeKey, receipt, inbox, requestId, phase labels)
must not be shown to normal users; they stay in Diagnostics.

## 7. UI Placement

- Status should be inline/quiet near the Save-to-Folder result, if feasible.
- Raw IDs, debug status, Connect folder, Send test request, and Check receipt
  remain in Settings -> Diagnostics -> Archive Request Delivery.
- Temporary/debug controls live only inside the relevant Settings/Diagnostics or
  feature card.
- No app-wide floating buttons and no app-wide overlays.

## 8. Boundaries

- Chrome remains intent-only; Desktop remains authoritative.
- Chrome does not call `enqueueSavedChatArchiveRequestV1`.
- Chrome does not call `materializeSavedChatArchiveRequestV1`.
- Chrome does not write packages.
- Chrome does not write CAS.
- Chrome does not write SQLite.
- Chrome does not compute `contentHash`.
- No auto-materialization.
- No sync/WebDAV/cloud.
- No native messaging.
- No localhost relay.
- No import/recovery.
- No Archive Health mutation.
- No user-folder export/save-dialog.

## 9. Implementation Slices

- **E.1.0 (this note):** contract.
- **E.1.1:** flag-gated runtime hook, default OFF — a quiet companion on a
  successful Save-to-Folder that constructs `builderOptions` from the saved row
  and calls `deliverSavedChatArchiveRequestV1`; deliver-only; never blocks the
  save.
- **E.1.2:** focused validator / static proof (flag OFF by default, gated on
  Save-to-Folder not Add-to-Library, ids-only/no content, product strings, no
  app-wide button, delivery-API-only).
- **E.1.3:** manual runtime smoke.
- **E.1.4:** evidence / closure.

## 10. Files Likely Touched Later (Not In E.1.0)

- `src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js` (the
  Save-to-Folder companion hook) — exact current path confirmed; the E.0/E.1
  earlier `src-runtime-base/...` reference was a guess and is corrected here.
- A focused validator under `tools/validation/studio/`.
- Optionally a small focused helper module if the monolith can delegate cleanly,
  plus its loader in `studio.html` and `tools/product/studio/pack-studio.mjs`
  (hunk-staged).
- A feature-flag definition/registration for `archive.deliverOnSaveToFolder`
  (default OFF), if the flag system requires declaration.

## Files That Must Not Be Touched In E.1.0

- Runtime files (including the Library Actions Core monolith).
- Validators.
- Chrome service-worker.
- Desktop runtime.
- Tauri capabilities.
- Sync files.
- Materializer / package writer-projector / asset CAS / store adapters.
- Archive Health UI.
- Import/recovery.
- WebDAV/cloud.
- User-folder export/save-dialog.
- The shipped delivery module and its Diagnostics UI (reuse as-is).

## Validation

```text
git diff --check
git diff --cached --check
```

Results:

- `git diff --check`: clean.
- `git diff --cached --check`: clean.

No docs/markdown lint/check script exists in `package.json` (confirmed); none was
run.

## Outcome

E.1.0 is CONTRACT - NOT IMPLEMENTED. The Save-to-Folder archive companion hook is
now contract-locked: flag `archive.deliverOnSaveToFolder` (default OFF), triggers
only after a successful Save-to-Folder, gated on Chrome-surface + connected
folder + saved/snapshot-backed row, deliver-only through the proven Phase D API,
metadata-only, product-language status, Diagnostics-only debug controls, and
Chrome intent-only / Desktop authoritative throughout.

Recommended next implementation step: E.1.1 — the flag-gated, default-OFF
Save-to-Folder companion hook in the Library Actions Core file, deliver-only,
never blocking the save.

Do not implement yet.
