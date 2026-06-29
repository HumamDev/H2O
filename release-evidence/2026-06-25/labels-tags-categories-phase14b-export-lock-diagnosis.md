# Labels / Tags / Categories / Classification Metadata Sync

## Phase 14B: Chrome Export Lock Diagnosis

Date: 2026-06-29

Verdict:

- Phase 14B export-lock diagnosis/fix: PASS
- Fix implemented: YES, narrowly scoped to Desktop-origin import event echo suppression
- Phase 14 live proof should be rerun: YES
- Product metadata sync: NOT READY

Context commits:

- Phase 13 `chat-category-clear` implementation: `e463a884997f9b63057be7545d2c40bccbadbbc6`
- Phase 14 blocked live runtime evidence: `41dfcfe288ce3c45042a550084c0afb2f8394708`

## Scope

Phase 14B investigated the Chrome `chrome-to-desktop-export-in-flight` blocker that prevented
the Phase 14 live `chat-category-clear` proof from exporting `libraryMetadataMutationRequests[]`
to `chrome-latest.json`.

This phase did not change `chat-category-clear` request semantics. It did not broaden Desktop
metadata apply behavior. The only applied metadata request types remain:

- `chat-category-assign`
- `chat-category-clear`

## Files Inspected

- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `tools/validation/sync/validate-folder-restore-phase6c2b-export-inflight-recovery.mjs`
- `tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase14-chat-category-clear-live-runtime-proof.md`

## Files Changed

- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `tools/validation/sync/validate-labels-tags-categories-phase14b-export-lock-diagnosis.mjs`
- `release-evidence/2026-06-25/labels-tags-categories-phase14b-export-lock-diagnosis.md`

## Root Cause

The Phase 14 manual export was blocked by the Chrome auto-import export lock:

- blocker: `chrome-to-desktop-export-in-flight`
- lock owner: `auto-import.exportNow`
- lock reason: `event:evt:h2o:library:cross-surface-sync`
- status codes included `duplicate-suppressed` and `loop-suppressed`

The repo path showed that `folder-import.mv3.js` dispatches
`evt:h2o:library:cross-surface-sync` after Desktop-to-Chrome import for UI refresh:

```js
global.dispatchEvent(new CustomEvent('evt:h2o:library:cross-surface-sync', {
  detail: { source: 'sync-folder-import', refreshMode: refreshMode, t: Date.now() },
}));
```

Chrome `auto-import.mv3.js` also listened to `evt:h2o:library:cross-surface-sync` as a
Chrome-to-Desktop export trigger, but the listener ignored the event detail. A Desktop-origin
import refresh event could therefore schedule a Chrome export:

```js
exportNow({ reason: 'event:' + eventName })
```

This creates an echo path:

1. Chrome imports Desktop `latest.json`.
2. The import path dispatches `evt:h2o:library:cross-surface-sync` for UI refresh.
3. Auto-import treats the refresh event as Chrome-origin export intent.
4. `auto-import.exportNow` starts or refreshes an event-triggered Chrome export.
5. Manual Phase 14 export observes the event-trigger export lock and reports
   `chrome-to-desktop-export-in-flight`.

The root cause is not the `chat-category-clear` request shape. The request remained pending,
valid, request-only, and non-destructive.

## Lock / Loop-Suppression Behavior Before

Before Phase 14B:

- `auto-import.exportNow` already had active in-memory lock blocking.
- `auto-import.exportNow` already had bounded stale-lock clearing at
  `CHROME_EXPORT_IN_FLIGHT_STALE_MS`.
- `folder-import.runChromeToDesktopExport` also had a facade in-flight lock and stale-lock clearing.
- Event-triggered exports did not distinguish Desktop-origin import refresh events from
  Chrome-origin mutation events.
- `duplicate-suppressed` / `loop-suppressed` status could appear during no-op Desktop import
  handling, while the cross-surface event still fed the Chrome export trigger.

## Fix

`auto-import.mv3.js` now carries a small exact source suppression list:

```js
var DESKTOP_ORIGIN_IMPORT_EVENT_SOURCES = ['sync-folder-import'];
```

The event listener now forwards the event object into `onTriggerEvent`, and the trigger path checks:

- event name must be exactly `evt:h2o:library:cross-surface-sync`
- event detail source must be exactly `sync-folder-import`

Only that Desktop-origin import refresh event is suppressed for Chrome export scheduling. The
suppressed event is recorded with:

- `eventTriggerSuppressedCount`
- `lastEventTriggerSuppressedAt`
- `lastEventTriggerSuppressedName`
- `lastEventTriggerSuppressedSource`
- `lastEventTriggerSuppressedReason`

The suppression reason is:

- `desktop-origin-import-event`

Manual triggers remain source-less and are not suppressed. Other event-trigger names remain
eligible for export under the existing flag gates.

## Diagnostics Added

`H2O.Studio.sync.autoImport.status()` / `diagnose()` now expose:

- `desktopOriginImportEventSources`
- `eventTriggerSuppressedCount`
- `lastEventTriggerSuppressedAt`
- `lastEventTriggerSuppressedName`
- `lastEventTriggerSuppressedSource`
- `lastEventTriggerSuppressedReason`
- existing lock owner/reason/age/stale-threshold diagnostics remain unchanged

These fields are read-only diagnostics. They do not clear locks, write metadata, or change request
payloads.

## Safety Boundaries

Preserved:

- Desktop remains canonical authority.
- Chrome remains request-only for metadata mutation intent.
- Chrome canonical metadata mutation remains absent.
- Desktop apply behavior is unchanged.
- Applied metadata request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
- No new delete, unbind, remove, purge, or hard-delete action was introduced.
- `chat-category-clear` still clears only the chat category assignment through the existing
  Desktop apply path.
- No WebDAV/cloud/relay transport was added.

Delete/purge safety remains:

- `noHardDelete`
- `noPurge`
- `noChatDelete`
- `noSnapshotDelete`
- `noAssetDelete`
- no label delete
- no tag delete
- no category delete
- no metadata delete

## Validator Output

Validation command added:

```sh
node tools/validation/sync/validate-labels-tags-categories-phase14b-export-lock-diagnosis.mjs
```

The validator proves:

- Desktop-origin `sync-folder-import` cross-surface events are suppressed before export scheduling.
- Manual trigger calls remain unsuppressed.
- Event detail is forwarded to the listener.
- Suppression diagnostics are exposed.
- Active `chrome-to-desktop-export-in-flight` blocking remains.
- Bounded stale-lock clearing remains.
- The folder facade export lock remains.
- `libraryMetadataMutationRequests[]` export path remains separate and available.
- Phase 13 applied request boundaries remain in force.
- No global loop-suppression disable or polling loop was introduced.

Full validation results are reported in the Phase 14B turn closeout.

## Phase 14 Rerun Readiness

Phase 14 live proof should be rerun after this change.

The rerun should verify:

1. A Chrome `chat-category-clear` pending request can still be created.
2. Desktop-origin import refresh events increment `eventTriggerSuppressedCount` instead of
   scheduling `auto-import.exportNow`.
3. Manual `folder.exportChromeToSyncFolder({ reason: ... })` can export `chrome-latest.json`
   without being starved by `event:evt:h2o:library:cross-surface-sync`.
4. Desktop imports and applies the request through `H2O.Studio.store.categories.clearChat(chatId)`.
5. Desktop emits a receipt.
6. Chrome imports the receipt read-only.
7. Replaying the request remains idempotent.
8. No delete/purge/Chrome canonical mutation occurs.

## Remaining Gaps

- Phase 14 live end-to-end proof is still not closed until rerun in live Desktop Studio and Chrome
  Studio.
- Product metadata sync remains NOT READY beyond the already proven safe request types.
- This phase does not alter broader loop-suppression or duplicate-suppression policy; it only
  prevents Desktop-origin import UI refresh events from echoing into Chrome export scheduling.

## Recommended Next Slice

Phase 14C: rerun the live `chat-category-clear` proof after the Phase 14B export-lock fix.

The rerun should keep the same hard boundaries:

- no request-type broadening
- no Chrome canonical mutation
- no Desktop canonical mutation beyond existing safe apply paths
- no delete/purge/destructive behavior
- no WebDAV/cloud/relay transport
