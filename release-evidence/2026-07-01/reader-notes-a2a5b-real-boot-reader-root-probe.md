# Reader & Notes A2a.5b Real-Boot Reader-Root Probe Evidence

Date: 2026-07-01

Baseline commit:

```txt
0edd103 feat(reader-notes): add A2a.5 reader-root resolution probe
```

## Verdict

MVP-A2a.5b real-boot reader-root probe gate is CLOSED.

The proof was captured in a real Desktop Studio Tauri WebView boot using AppleWebKit. With a real saved reader open, the operator-only, read-only probe `H2O.Studio.readerNotes.highlightResolutionUi.probe(...)` located the live `#viewReader > .cgFrame`, derived `itemId` from `frame.dataset.chatId`, invoked the read-only consumer, and returned data-only rows resolving real highlights against the real reader DOM — with no rendering, no DOM mutation, no storage writes, no live DOM nodes, and XPath deferred. This evidence closes only the real-boot reader-root probe gate. It does not authorize UI rendering (A2a.6), automatic invocation, XPath, or A2b.

## Surface Tested

Desktop Studio Tauri WebView / AppleWebKit.

User agent:

```txt
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)
```

Timestamp:

```txt
2026-07-01T17:51:28.387Z
```

## Setup Context

A saved reader was opened via `renderReader(snapshotId)` before running the probe:

```txt
snapshot:        snap_1778518803736_g8qie3rz
chat / itemId:   69de12dc-b7dc-838c-a553-916422265e5a
title:           Half Squats and Acceleration
hasHighlight:    true
readerRoot:      true
cgFrameCount:    1
finalReaderChatId: 69de12dc-b7dc-838c-a553-916422265e5a
```

## Method

- The smoke invoked the real loaded probe: `H2O.Studio.readerNotes.highlightResolutionUi.probe({ note: 'a2a5b-real-boot' })`.
- Flags were enabled non-destructively via a temporary `H2O.flags.get` wrapper (returning `true` for the six reader-notes flags: `highlightResolutionUi`, `highlightResolutionConsumer`, `anchorResolver`, `annotationFacade`, `annotationHighlights`, `libraryItemView`); no `flags.set` was called, so no flag state was persisted. The wrapper was restored in `finally` (`flagsRestored: true`).
- The operator opt-in key `h2o.readerNotes.highlightResolutionUi.operatorOptIn` was set in setup and restored to its prior value in `finally` (`optInRestored: true`). Setup/cleanup opt-in writes are outside the measured window.
- DOM, mark/overlay count, and full `localStorage` state were snapshotted immediately before and after the probe call only; the probe made no changes to any of them (`bodyUnchanged: true`, `marksBefore === marksAfter === 2`, `storageUnchangedDuringProbe: true`).

## Captured Result

```json
{
  "schema": "h2o.readerNotes.a2a5b.realBootReaderRootProbe.result.v1",
  "ok": true,
  "status": "real-boot-reader-root-probe-passed",
  "checks": {
    "uiPresent": true,
    "defaultEnabledBefore": false,
    "publicRelease": false,
    "enabledAfterSetup": true,
    "status": "ok",
    "rootFound": true,
    "itemId": "69de12dc-b7dc-838c-a553-916422265e5a",
    "resolvedCount": 2,
    "unresolvedCount": 2,
    "sampleText": "squats vs other movements",
    "sampleSpan": { "start": 85, "end": 110 },
    "xpathDeferred": true,
    "resultSerializable": true,
    "resultHasNoLiveNodes": true,
    "bodyUnchanged": true,
    "marksBefore": 2,
    "marksAfter": 2,
    "storageUnchangedDuringProbe": true,
    "flagsRestored": true,
    "optInRestored": true
  },
  "probeResult": {
    "schemaVersion": 1,
    "status": "ok",
    "itemId": "69de12dc-b7dc-838c-a553-916422265e5a",
    "rootFound": true,
    "resolvedCount": 2,
    "unresolvedCount": 2,
    "result": {
      "schemaVersion": 1,
      "itemId": "69de12dc-b7dc-838c-a553-916422265e5a",
      "resolved": [
        {
          "annotationId": "highlight:69de12dc-b7dc-838c-a553-916422265e5a:3d1782a8-8e7e-4d9b-8e10-2280616cb595:hl_e9dhnqw",
          "nativeId": "hl_e9dhnqw",
          "answerId": "3d1782a8-8e7e-4d9b-8e10-2280616cb595",
          "source": {
            "store": "highlights",
            "chatId": "69de12dc-b7dc-838c-a553-916422265e5a",
            "answerId": "3d1782a8-8e7e-4d9b-8e10-2280616cb595",
            "nativeId": "hl_e9dhnqw",
            "convoId": "c/69de12dc-b7dc-838c-a553-916422265e5a"
          },
          "status": "anchored",
          "span": { "start": 85, "end": 110 },
          "selectorUsed": "textQuote",
          "confidence": 1,
          "reason": "textQuote-exact",
          "text": "squats vs other movements",
          "diagnostics": {
            "tried": ["textQuote"],
            "matchCount": 1,
            "approx": 85,
            "xpathDeferred": true,
            "notes": ["a2a5b-real-boot"]
          }
        },
        {
          "annotationId": "highlight:69de12dc-b7dc-838c-a553-916422265e5a:addd91a0-6e6e-4ffc-8630-f8b7b9ed7b3e:hl_psflftd",
          "nativeId": "hl_psflftd",
          "answerId": "addd91a0-6e6e-4ffc-8630-f8b7b9ed7b3e",
          "source": {
            "store": "highlights",
            "chatId": "69de12dc-b7dc-838c-a553-916422265e5a",
            "answerId": "addd91a0-6e6e-4ffc-8630-f8b7b9ed7b3e",
            "nativeId": "hl_psflftd",
            "convoId": "c/69de12dc-b7dc-838c-a553-916422265e5a"
          },
          "status": "anchored",
          "span": { "start": 1079, "end": 1141 },
          "selectorUsed": "textQuote",
          "confidence": 1,
          "reason": "textQuote-exact",
          "text": "Half squats are one useful exercise for improving acceleration",
          "diagnostics": {
            "tried": ["textQuote"],
            "matchCount": 1,
            "approx": 1079,
            "xpathDeferred": true,
            "notes": ["a2a5b-real-boot"]
          }
        }
      ],
      "unresolved": [
        {
          "annotationId": "highlight:69de12dc-b7dc-838c-a553-916422265e5a:addd91a0-6e6e-4ffc-8630-f8b7b9ed7b3e:hl_sl6bxtr",
          "nativeId": "hl_sl6bxtr",
          "answerId": "addd91a0-6e6e-4ffc-8630-f8b7b9ed7b3e",
          "source": {
            "store": "highlights",
            "chatId": "69de12dc-b7dc-838c-a553-916422265e5a",
            "answerId": "addd91a0-6e6e-4ffc-8630-f8b7b9ed7b3e",
            "nativeId": "hl_sl6bxtr",
            "convoId": "c/69de12dc-b7dc-838c-a553-916422265e5a"
          },
          "status": "orphaned",
          "span": null,
          "selectorUsed": null,
          "confidence": 0,
          "reason": "resolver-orphaned",
          "text": "",
          "diagnostics": {
            "tried": ["textQuote", "textPos"],
            "matchCount": 0,
            "approx": 17,
            "xpathDeferred": true,
            "notes": ["a2a5b-real-boot", "textPos quote mismatch"]
          }
        },
        {
          "annotationId": "highlight:69de12dc-b7dc-838c-a553-916422265e5a:82625f5d-129c-4a27-9a9a-be093ed7980e:hl_l3hh4k4",
          "nativeId": "hl_l3hh4k4",
          "answerId": "82625f5d-129c-4a27-9a9a-be093ed7980e",
          "source": {
            "store": "highlights",
            "chatId": "69de12dc-b7dc-838c-a553-916422265e5a",
            "answerId": "82625f5d-129c-4a27-9a9a-be093ed7980e",
            "nativeId": "hl_l3hh4k4",
            "convoId": "c/69de12dc-b7dc-838c-a553-916422265e5a"
          },
          "status": "orphaned",
          "span": null,
          "selectorUsed": null,
          "confidence": 0,
          "reason": "resolver-orphaned",
          "text": "",
          "diagnostics": {
            "tried": ["textQuote", "textPos"],
            "matchCount": 0,
            "approx": 1,
            "xpathDeferred": true,
            "notes": ["a2a5b-real-boot", "textPos quote mismatch"]
          }
        }
      ],
      "diagnostics": {
        "reason": "ok",
        "enabled": true,
        "considered": 4,
        "resolvedCount": 2,
        "unresolvedCount": 2,
        "skippedCount": 0,
        "skipped": [],
        "upstream": {
          "annotationsAvailable": true,
          "resolverAvailable": true,
          "annotationsEnabled": true,
          "resolverEnabled": true
        },
        "errors": []
      }
    },
    "diagnostics": {
      "reason": "ok",
      "enabled": true,
      "publicRelease": false,
      "consumerAvailable": true,
      "errors": []
    }
  },
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  "timestamp": "2026-07-01T17:51:28.387Z"
}
```

## Confirmed Checks

Probe presence, gating, and non-destructive setup:

- Probe present and installed (`uiPresent: true`).
- Default-off before enabling (`defaultEnabledBefore: false`).
- Public-release guard inactive in this dev build (`publicRelease: false`).
- Enabled only after temporary flag wrapper + opt-in (`enabledAfterSetup: true`).
- Flags and opt-in restored (`flagsRestored: true`, `optInRestored: true`).

Real reader-root resolution:

- `status: "ok"`, `rootFound: true`.
- `itemId` derived from `frame.dataset.chatId`: `69de12dc-b7dc-838c-a553-916422265e5a`.
- `resolvedCount: 2` against the real reader DOM:
  - `"squats vs other movements"` at span `{85, 110}` (`textQuote-exact`, confidence 1).
  - `"Half squats are one useful exercise for improving acceleration"` at span `{1079, 1141}` (`textQuote-exact`, confidence 1).
- `unresolvedCount: 2` — two highlights correctly orphaned (`resolver-orphaned`, `textPos quote mismatch`); the resolver declined to place stale anchors rather than mis-resolving them (fail-safe, no mis-attribution).
- `considered: 4`; upstream all enabled (`annotationsEnabled`/`resolverEnabled: true`); `errors: []`.

Data-only, read-only, non-rendering:

- `resultSerializable: true`, `resultHasNoLiveNodes: true` (no `range`/`annotation`/`msgEl`, no DOM nodes).
- `bodyUnchanged: true`; `marksBefore: 2`, `marksAfter: 2` (probe rendered nothing and inserted no marks/overlays).
- `storageUnchangedDuringProbe: true` (no storage writes during the probe call).
- `xpathDeferred: true` (XPath present in anchors but deferred; no XPath resolution).

Authenticity: every row's `diagnostics.notes` contains `"a2a5b-real-boot"`, confirming the probe's `options.note` propagated through probe → `resolveForItem` → `resolveHighlight` → core `resolveInText`; the orphaned rows also carry the core's `"textPos quote mismatch"` diagnostic — genuine real-resolver behavior against the real reader DOM.

## Boundaries

- This closes only the real-boot reader-root probe gate.
- This does not authorize UI rendering (A2a.6) or automatic consumer invocation.
- Overlay rendering must later respect `STUDIO_OVERLAY_CONTRACT.md` (never mutate captured turn DOM; render into a separate, removable overlay layer).
- XPath remains deferred.
- A2b remains deferred.
- sidecar, enrichment, renderer, native_note, imported_document, converted_note, and saved-chat work remain deferred.
- No runtime/source modules were modified by A2a.5b; the smoke was non-persistent (flag wrapper + opt-in restored, no storage writes during the probe).
