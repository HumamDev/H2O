# Saved Chat Archive Delivery Listener — E.1.2 Static Review

Date: 2026-06-24

Status: E.1.2 STATIC REVIEW - PASSED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/evidence-only note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes.

## Scope

E.1.2 is the static review / evidence for the E.1.1 runtime listener. It records
that E.1.1 implemented the corrected E.1.0a trigger and passed static + VM
validation.

Implementation commit:

```text
6c5e20c7b5eea10beb882a43e37d286b9fdbb7db feat(studio): add archive delivery listener for saved rows
```

## Corrected E.1.0a Trigger Implemented

E.1.1 is the corrected-trigger companion, not the original Save-to-Folder success
hook:

- not a Save-to-Folder success hook (the Chrome facade returns
  `native-context-required` and never succeeds);
- not `S0F0j. 🎬 Library Actions Core - Studio.js` (byte-locked canonical mirror);
- not `S0F1j. 🎬 Library Actions - Studio.js`;
- a Chrome-only listener on `evt:h2o:library-index:updated`, tolerating
  `evt:h2o:library:cross-surface-sync` as a re-read trigger;
- the listener reads `H2O.LibraryIndex.getAll()` because the event detail carries
  only summary metadata (`{ reason, rows, dataHash, … }`).

## Files Changed In E.1.1

- `src-surfaces-base/studio/ingestion/saved-chat-archive-on-save.mv3.js`
- `tools/validation/studio/validate-saved-chat-archive-on-save-v1.mjs`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`

## Reviewed Behavior

- feature flag: `archive.deliverOnSaveToFolder`.
- default OFF via `H2O.flags.get("archive.deliverOnSaveToFolder", false)`.
- OFF means no behavior change (listener is inert).
- Chrome/MV3 only; bails on Desktop/Tauri.
- debounced event listener (one-shot reset timer; not a loop).
- no polling loop.
- no watcher.
- no `setInterval`.
- no `MutationObserver` for delivery.
- reads `H2O.LibraryIndex.getAll()`.
- selects saved / snapshot-backed rows.
- excludes link-only Add-to-Library rows.
- excludes archived / deleted rows when row state exposes that.
- requires `chatId` and `snapshotId`.
- missing `snapshotId` skips with `missing-snapshot-id` and does not mark
  delivered.
- persistent dedupe via `chrome.storage.local`.
- dedupe storage key: `h2o:studio:archive-on-save:delivered:v1`.
- dedupe key includes `chatId|snapshotId`.
- per-event cap: 5.
- calls only `deliverSavedChatArchiveRequestV1`.
- delivery is best-effort and never blocks library rendering.

## Request Construction Boundaries

- `source.surface = 'chrome-studio'`.
- `intent.kind = 'save-to-folder'`.
- `desktopResolution.studioChatId` from the row.
- `desktopResolution.snapshotId` from the row.
- `desktopResolution.requireExistingDesktopSnapshot = true`.
- no transcript.
- no messages.
- no HTML / outerHTML.
- no markdown.
- no assets / images / blobs.
- no package paths.
- no CAS paths.
- no `contentHash`.
- no package content.

## Explicit Non-Goals Preserved

- no edits to `S0F0j`.
- no edits to `S0F1j`.
- no Add-to-Library hook.
- no `enqueueSavedChatArchiveRequestV1` call from Chrome.
- no `materializeSavedChatArchiveRequestV1` call from Chrome.
- no package writer call.
- no CAS / store writes.
- no Desktop runtime changes.
- no capabilities changes.
- no sync/WebDAV/cloud.
- no native messaging.
- no localhost relay.
- no import/recovery.
- no Archive Health UI mutation.
- no user-folder export/save-dialog.
- no app-wide floating buttons or overlays.

## Validation Results (E.1.1, re-verified)

- `node --check src-surfaces-base/studio/ingestion/saved-chat-archive-on-save.mv3.js`: passed.
- `node --check tools/validation/studio/validate-saved-chat-archive-on-save-v1.mjs`: passed.
- `node tools/validation/studio/validate-saved-chat-archive-on-save-v1.mjs`: PASS 19.
- VM checks covered:
  - flag-OFF no-op,
  - flag-ON metadata-only delivery,
  - dedupe (second delivery skipped locally),
  - missing-snapshot skip (not delivered, not marked),
  - link-only exclusion,
  - diagnose.
- the validator confirmed `S0F0j` / `S0F1j` were not staged in the E.1.1 commit.
- D.3C delivery runtime validator: PASS 24.
- D.3C.0 contract validator: all 22 checks passed.
- D.3A builder validator: PASS 18.
- `git diff --check`: clean.
- `git diff --cached --check`: clean.

No docs/markdown lint script exists in `package.json` (confirmed); none was run.

## Outcome

E.1.2 STATIC REVIEW - PASSED. The E.1.1 archive-on-save listener is statically
and VM-verified: flag-gated and OFF by default, Chrome-only, event-driven (no
polling/watcher), reads `H2O.LibraryIndex.getAll()`, selects only saved
snapshot-backed rows (excluding link-only/Add-to-Library and archived/deleted),
dedupes persistently per `chatId|snapshotId`, delivers metadata-only requests
through the D.3C delivery API only, never edits the byte-locked monoliths, and
keeps Chrome intent-only / Desktop authoritative. The remaining open work is the
E.1.3 manual runtime smoke and E.1.4 closure.
