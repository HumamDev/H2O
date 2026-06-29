# Labels / Tags / Categories / Classification Metadata Sync

## Phase 14D: Export-Lock Follow-Up Diagnosis

Date: 2026-06-29

Verdict:

- Phase 14C live request creation: PASS
- Phase 14C live manual Chrome export: BLOCKED
- Phase 14D diagnosis: BLOCKED / evidence-only
- Fix implemented in this phase: NO
- Product metadata sync: NOT READY

Context commits:

- Phase 13 `chat-category-clear` implementation: `e463a884997f9b63057be7545d2c40bccbadbbc6`
- Phase 14 blocked live proof evidence: `41dfcfe288ce3c45042a550084c0afb2f8394708`
- Phase 14B export-lock fix: `ecb0d279532398ba1a033c3827da9d41d279e0e6`

## Scope

Phase 14D follows the Phase 14C live rerun after the Phase 14B fix. Phase 14B suppressed the
Desktop-origin import refresh event:

- event: `evt:h2o:library:cross-surface-sync`
- source: `sync-folder-import`

The Phase 14C rerun hit a different lock reason:

- event: `evt:h2o:sync:chrome-auto-import:trigger`
- owner: `auto-import.exportNow`

This phase diagnoses that new blocker and records exact next runtime steps. It does not change
product code.

## Files Inspected

- `src-surfaces-base/studio/sync/auto-import.mv3.js`
- `src-surfaces-base/studio/sync/folder-import.mv3.js`
- `src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js`
- `release-evidence/2026-06-25/labels-tags-categories-phase14-chat-category-clear-live-runtime-proof.md`
- `release-evidence/2026-06-25/labels-tags-categories-phase14b-export-lock-diagnosis.md`

## Live Inputs Recorded

Chrome pending request:

```json
{
  "requestId": "library-metadata-mutation-request:92f08770-51f2-424d-81e3-4e9eca668a8d",
  "action": "chat-category-clear",
  "status": "pending",
  "chatId": "writer_identity_debug_1782300179966",
  "expectedCurrentBasisHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07",
  "noChromeCanonicalMutation": true,
  "noHardDelete": true,
  "noPurge": true,
  "noChatDelete": true,
  "noCategoryDelete": true,
  "noMetadataDelete": true
}
```

Desktop candidate:

```json
{
  "chatId": "writer_identity_debug_1782300179966",
  "currentCategoryId": "cat_software_development",
  "projectionChatCategoryAssignmentCount": 28,
  "projectionHash": "3a1ad142adfded843d22cb3533cbaa82cb891939f6602365268c74e24cbaef07"
}
```

Manual Chrome export result:

```json
{
  "ok": false,
  "status": "chrome-to-desktop-export-in-flight",
  "blocker": "chrome-to-desktop-export-in-flight",
  "error": "export already in flight",
  "chromeExportInFlightMemory": true,
  "chromeExportInFlightPersisted": false,
  "chromeExportInFlightAgeMs": 2522,
  "chromeExportInFlightStaleMs": 60000,
  "chromeExportLockOwner": "auto-import.exportNow",
  "chromeExportLockReason": "event:evt:h2o:sync:chrome-auto-import:trigger",
  "healthVerdict": "blocked"
}
```

## Diagnosis

This is not the Phase 14B root cause. Phase 14B addressed a Desktop-origin import refresh echo where
`evt:h2o:library:cross-surface-sync` with `source: sync-folder-import` could schedule Chrome export.

The Phase 14C blocker comes from the explicit Chrome auto-import trigger event:

```js
evt:h2o:sync:chrome-auto-import:trigger
```

Repo inspection found this trigger path in `S0F1h. 🎬 Library Sync - Studio.js`:

```js
const eventName = 'evt:h2o:sync:chrome-auto-import:trigger';
const detail = { reason: String(reason || 'native-broadcast'), t: Date.now(), source: 'studio-library-sync' };
if (autoImport && typeof autoImport.trigger === 'function') {
  autoImport.trigger({ eventName, reason: detail.reason, detail });
  ...
}
```

`auto-import.mv3.js` handles that trigger by scheduling a debounced export:

```js
exportNow({ reason: 'event:' + eventName })
```

The observed lock age was approximately 2.5 seconds, which is close to the 2 second event debounce
and far below the 60 second stale-lock threshold:

- lock age: `2522ms`
- stale threshold: `60000ms`

That makes the observed state most consistent with an active event-trigger export racing with the
manual proof export, not a stale leaked lock. Active concurrent export should still block a duplicate
manual export under the existing safety model.

## Current Classification

Most likely classification:

1. Active legitimate export in progress: LIKELY
2. Leaked lock: NOT PROVEN
3. Recurring auto-import trigger loop: POSSIBLE, not proven by the 2.5 second sample
4. Manual export blocked by event-trigger export: YES
5. Smoke-bridge/live proof setup issue: POSSIBLE, because the manual proof called export while the
   event export lock was still young

## Why No Code Fix Was Made

No code fix was made in Phase 14D because the captured lock is still young and below the existing
stale threshold. Clearing or bypassing it would weaken active-export duplicate protection.

The safe interpretation is:

- if the event-trigger export completes, the proof should inspect `chrome-latest.json` for the
  pending `libraryMetadataMutationRequests[]` entry instead of immediately launching a duplicate
  manual export;
- if the event-trigger export remains in-flight beyond the stale threshold or is repeatedly
  refreshed, that is a distinct stale/loop condition and should be fixed with a bounded event-trigger
  stale-lock policy.

## Safety Boundaries

Preserved:

- `chat-category-clear` semantics unchanged.
- Applied metadata request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
- Chrome remains request-only.
- Desktop remains canonical authority.
- No Chrome canonical metadata mutation.
- No Desktop canonical mutation beyond existing safe apply paths.
- No WebDAV/cloud/relay transport.
- No destructive action added.

Delete/purge boundaries remain:

- `noHardDelete`
- `noPurge`
- `noChatDelete`
- `noSnapshotDelete`
- `noAssetDelete`
- `noCategoryDelete`
- `noMetadataDelete`

## Exact Next Runtime Steps

Run these in Chrome Studio DevTools after creating the pending request. This proves whether the
event-trigger export completed or is stale/looping.

### 1. Chrome Studio DevTools: inspect event-trigger export after wait

Run once after waiting at least 8 seconds from the blocked manual export:

```js
copy(JSON.stringify(await (async () => {
  const folder = H2O?.Studio?.sync?.folder;
  const autoImport = H2O?.Studio?.sync?.autoImport;
  const requests = await folder.listLibraryMetadataMutationRequests({ status: 'pending' });
  const target = requests.find((row) =>
    row.requestId === 'library-metadata-mutation-request:92f08770-51f2-424d-81e3-4e9eca668a8d'
  ) || null;
  const status = autoImport?.status ? await autoImport.status() : null;
  const health = folder?.diagnoseHealth ? await folder.diagnoseHealth() : null;
  return {
    phase: 'phase14d-event-trigger-after-wait',
    requestStillPending: !!target,
    targetRequest: target ? {
      requestId: target.requestId,
      action: target.action || target.requestType,
      status: target.status,
      idempotencyKey: target.idempotencyKey,
      noChromeCanonicalMutation: target.noChromeCanonicalMutation === true,
      noHardDelete: target.noHardDelete === true,
      noPurge: target.noPurge === true,
      noChatDelete: target.noChatDelete === true,
      noCategoryDelete: target.noCategoryDelete === true,
      noMetadataDelete: target.noMetadataDelete === true
    } : null,
    autoImport: {
      lastExportStatus: status && status.lastExportStatus,
      lastExportFile: status && status.lastExportFile,
      lastExportBytes: status && status.lastExportBytes,
      lastExportError: status && status.lastExportError,
      inFlight: status && status.inFlight,
      chromeExportInFlightMemory: status && status.chromeExportInFlightMemory,
      chromeExportInFlightAgeMs: status && status.chromeExportInFlightAgeMs,
      chromeExportInFlightStaleMs: status && status.chromeExportInFlightStaleMs,
      chromeExportLockOwner: status && status.chromeExportLockOwner,
      chromeExportLockReason: status && status.chromeExportLockReason,
      eventTriggerCount: status && status.eventTriggerCount,
      eventTriggerSuppressedCount: status && status.eventTriggerSuppressedCount,
      lastEventName: status && status.lastEventName
    },
    health: {
      verdict: health && health.verdict,
      blockers: health && health.blockers,
      statusCodes: health && health.statusCodes
    }
  };
})(), null, 2));
```

### 2. Terminal: inspect exported `chrome-latest.json`

If Chrome reports `lastExportStatus: ok` or `lastExportFile: chrome-latest.json`, inspect the file:

```sh
node -e "const fs=require('fs'); const p=process.env.HOME + '/H2O Studio Sync/chrome-latest.json'; const b=JSON.parse(fs.readFileSync(p,'utf8')); const reqs=Array.isArray(b.libraryMetadataMutationRequests)?b.libraryMetadataMutationRequests:[]; const r=reqs.find(x=>x.requestId==='library-metadata-mutation-request:92f08770-51f2-424d-81e3-4e9eca668a8d'); console.log(JSON.stringify({ok:!!r, requestCount:reqs.length, request:r&&{requestId:r.requestId, action:r.action||r.requestType, status:r.status, chatId:r.chatId||(r.target&&r.target.chatId), noChromeCanonicalMutation:r.noChromeCanonicalMutation, noHardDelete:r.noHardDelete, noPurge:r.noPurge, noChatDelete:r.noChatDelete, noCategoryDelete:r.noCategoryDelete, noMetadataDelete:r.noMetadataDelete}}, null, 2));"
```

### 3. If still in-flight after 60 seconds

If `chromeExportInFlightAgeMs >= 60000` and the owner/reason remain:

- owner: `auto-import.exportNow`
- reason: `event:evt:h2o:sync:chrome-auto-import:trigger`

then Phase 14E should implement bounded stale event-trigger recovery or manual-export precedence for
stale event-trigger locks only.

## Recommended Next Slice

Phase 14E, depending on the next runtime output:

- If the event-trigger export completed and `chrome-latest.json` contains the pending request:
  continue the live proof from Desktop import/apply/receipt.
- If the event-trigger lock remains active beyond 60 seconds or keeps refreshing:
  implement a narrow stale/looping explicit-trigger lock fix with validator coverage.

Do not change `chat-category-clear` semantics in Phase 14E. Do not broaden applied metadata request
types. Product metadata sync remains NOT READY.
