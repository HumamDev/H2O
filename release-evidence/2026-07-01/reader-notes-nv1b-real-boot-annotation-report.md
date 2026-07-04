# Reader & Notes NV1b Real-Boot Annotation Report Evidence

Baseline commit:

```txt
bf9acc4 feat(reader-notes): add NV1 read-only annotation report consumer
```

## Verdict

MVP-NV1b real-boot annotation-report gate is **CLOSED**.

The proof was captured in a real Desktop Studio Tauri WebView boot using AppleWebKit. With a real saved reader
open, the real committed API `H2O.Studio.readerNotes.annotationReport.buildReport(...)` located the live
`#viewReader > .cgFrame`, derived `itemId` from `frame.dataset.chatId`, called the read-only A1 annotation
facade + A2a highlight-resolution consumer, and returned a serializable, data-only report with resolved
highlight counts against the real reader DOM — with **no rendering, no marks, no overlays, no DOM mutation,
no storage writes during the report, and XPath deferred**. This evidence closes only the real-boot
annotation-report gate. It does not authorize rendering, XPath, A2b, or MVP-B/native notes.

## Surface Tested

Desktop Studio Tauri WebView / AppleWebKit.

User agent:

```txt
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)
```

Timestamp:

```txt
2026-07-04T14:50:00.486Z
```

## Setup Context

Earlier attempts failed because no attributed annotation row existed for the old test chat. A valid
attributed highlight was then created/found on the current reader, and the final smoke used that current
reader and passed:

```txt
itemId:        68d808bb-7674-8329-9b8b-9044917b921d
highlightCount: 1
nativeId:      hl_hnan5qf
answerId:      8022b4ee-6dab-430d-9c4e-e0edbf980bd7
convoId:       c/68d808bb-7674-8329-9b8b-9044917b921d
```

## Method

- The smoke invoked the real loaded API: `H2O.Studio.readerNotes.annotationReport.buildReport(...)` against
  the live reader (no explicit `root`; the module located `#viewReader > .cgFrame` itself).
- Flags were enabled non-destructively via a temporary `H2O.flags.get` wrapper (returning `true` for the
  relevant Reader & Notes flags including `studio.readerNotes.annotationReport.enabled`); no `flags.set` was
  called, so no flag state was persisted. The wrapper was restored in `finally` (`flagsGetRestored: true`).
- The operator opt-in key `h2o.readerNotes.annotationReport.operatorOptIn` was set in setup and restored to
  its prior value in `finally` (`optInRestored: true`). Setup/cleanup opt-in writes are outside the measured
  report window.
- DOM (body / reader / frame hashes + child counts + `<mark>` count) and full storage state were snapshotted
  immediately before and after the `buildReport` call only; the report made no changes to any of them
  (`bodyUnchangedDuringReport`, `readerUnchangedDuringReport`, `frameUnchangedDuringReport`,
  `bodyChildCountUnchanged`, `marksUnchanged`, `storageUnchangedDuringReport` all `true`).

## Captured Result

```json
{
  "schema": "h2o.readerNotes.nv1b.annotationReport.realBoot.result.v1",
  "ok": true,
  "status": "annotation-report-real-boot-passed",
  "checks": {
    "readerNotesPresent": true,
    "annotationReportPresent": true,
    "annotationReportFrozen": true,
    "flagKey": "studio.readerNotes.annotationReport.enabled",
    "optInKey": "h2o.readerNotes.annotationReport.operatorOptIn",
    "defaultOffBeforeEnable": true,
    "publicReleaseGuardFalse": true,
    "lastDiagnosticsWasNullBeforeProbe": false,
    "readerPresent": true,
    "framePresent": true,
    "frameChatId": "68d808bb-7674-8329-9b8b-9044917b921d",
    "expectedReaderItem": true,
    "enabledAfterSetup": true,
    "reportReturned": true,
    "reportSerializable": true,
    "reportHasNoLiveKeys": true,
    "reportItemIdMatchesReader": true,
    "reportRootFound": true,
    "highlightArraysPresent": true,
    "notesArrayPresent": true,
    "bookmarksArrayPresent": true,
    "countsPresent": true,
    "hasHighlightData": true,
    "bodyUnchangedDuringReport": true,
    "readerUnchangedDuringReport": true,
    "frameUnchangedDuringReport": true,
    "bodyChildCountUnchanged": true,
    "marksUnchanged": true,
    "storageUnchangedDuringReport": true,
    "flagsGetRestored": true,
    "optInRestored": true
  },
  "reportSummary": {
    "schemaVersion": 1,
    "itemId": "68d808bb-7674-8329-9b8b-9044917b921d",
    "rootFound": true,
    "truncated": false,
    "counts": {
      "highlightsConsidered": 1,
      "highlightsResolved": 1,
      "highlightsOrphaned": 0,
      "highlightsSkipped": 0,
      "notes": 0,
      "bookmarks": 0
    },
    "highlightsResolved": 1,
    "highlightsOrphaned": 0,
    "highlightsSkipped": 0,
    "notes": 0,
    "bookmarks": 0,
    "diagnosticsKeys": [
      "annotationsAvailable",
      "annotationsEnabled",
      "enabled",
      "errors",
      "limit",
      "optIn",
      "publicRelease",
      "reason",
      "resolutionConsumerAvailable",
      "resolutionConsumerEnabled",
      "resolutionDiagnostics",
      "skippedReasons",
      "truncated"
    ]
  },
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  "timestamp": "2026-07-04T14:50:00.486Z",
  "failures": [],
  "notes": [],
  "domBefore": {
    "bodyHash": "1e495e7e",
    "bodyTextHash": "24722135",
    "bodyChildCount": 1646,
    "readerHash": "2a1cdada",
    "frameHash": "c6306703",
    "marks": 1,
    "framePresent": true,
    "frameChatId": "68d808bb-7674-8329-9b8b-9044917b921d"
  },
  "domAfter": {
    "bodyHash": "1e495e7e",
    "bodyTextHash": "24722135",
    "bodyChildCount": 1646,
    "readerHash": "2a1cdada",
    "frameHash": "c6306703",
    "marks": 1,
    "framePresent": true,
    "frameChatId": "68d808bb-7674-8329-9b8b-9044917b921d"
  }
}
```

## Confirmed Checks

Presence, gating, and non-destructive setup:

- `annotationReport` present and frozen (`annotationReportPresent: true`, `annotationReportFrozen: true`).
- Default-off before enabling (`defaultOffBeforeEnable: true`).
- Public-release guard inactive in this dev build (`publicReleaseGuardFalse: true`).
- Enabled only after temporary flag wrapper + opt-in (`enabledAfterSetup: true`).
- Flag wrapper and opt-in restored (`flagsGetRestored: true`, `optInRestored: true`).

Real reader resolution + report:

- Reader/frame present (`readerPresent: true`, `framePresent: true`).
- `frameChatId` and report `itemId` both equal `68d808bb-7674-8329-9b8b-9044917b921d`
  (`reportItemIdMatchesReader: true`, `expectedReaderItem: true`).
- `reportRootFound: true`.
- `reportSerializable: true`; `reportHasNoLiveKeys: true` (no `range`/`msgEl`/`annotation`/`node`/`root`
  live references escaped).
- Highlight arrays present (`highlightArraysPresent: true`); notes/bookmarks arrays present
  (`notesArrayPresent: true`, `bookmarksArrayPresent: true`); counts present (`countsPresent: true`);
  `hasHighlightData: true`.
- Counts: `highlightsConsidered: 1`, `highlightsResolved: 1`, `highlightsOrphaned: 0`,
  `highlightsSkipped: 0`, `notes: 0`, `bookmarks: 0`, `truncated: false`.

Data-only, read-only, non-rendering (before → after unchanged):

- `bodyUnchangedDuringReport: true` (`bodyHash 1e495e7e` → `1e495e7e`; `bodyTextHash 24722135` → `24722135`).
- `readerUnchangedDuringReport: true` (`readerHash 2a1cdada` → `2a1cdada`).
- `frameUnchangedDuringReport: true` (`frameHash c6306703` → `c6306703`).
- `bodyChildCountUnchanged: true` (`1646` → `1646`).
- `marksUnchanged: true` (`marks 1` → `1`) — the report inserted no `<mark>` and removed none; the single
  pre-existing mark is S3H1a-owned.
- `storageUnchangedDuringReport: true` (no storage writes during the report call).
- `failures: []`.

## Notes on Acceptable Non-Criteria

- **`notes: 0` / `bookmarks: 0` are acceptable for this fixture.** The gate requires that the report expose
  the `notes` and `bookmarks` arrays and their counts, not that they be non-zero. The current reader had one
  attributed highlight and no notes/bookmarks, which is a valid, correctly-reported state.
- **`lastDiagnosticsWasNullBeforeProbe: false` is acceptable.** Earlier failed probe attempts had already
  run and populated `lastDiagnostics` before this passing run; a null pre-probe value is not a pass
  criterion for this gate.

## Boundaries

- This closes only the real-boot annotation-report smoke gate.
- No rendering, marks, overlays, DOM mutation, storage writes during the report, XPath, A2b,
  MVP-B/native notes, Sync, or downstream work occurred.
- **S3H1a remains the sole visible highlight renderer** (the one pre-existing `<mark>` is S3H1a-owned and was
  unchanged `1 → 1`).
- NV1b does not authorize rendering, XPath, A2b, or MVP-B.
- Any future export / download / product UI for the report remains separate and unauthorized by this gate.
- No runtime/source modules, loader/pack, or validators were modified by NV1b; the smoke was non-persistent
  (flag wrapper + opt-in restored, no storage writes during the report).
