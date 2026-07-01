# Reader & Notes A2a.4.2c Explicit-Resolution Smoke Evidence

Date: 2026-07-01

Baseline commit:

```txt
6c3d9ad test(reader-notes): close A2a.4.2b real-boot consumer gate
```

Prior consumer commit:

```txt
c540113 feat(reader-notes): add A2a.4.2 read-only highlight consumer
```

## Verdict

MVP-A2a.4.2c explicit-resolution smoke gate is CLOSED.

The proof was captured in a real Desktop Studio Tauri WebView boot using AppleWebKit. It explicitly invoked the real loaded consumer namespace `H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(...)` with controlled input and proved it resolves a highlight into a data-only row while remaining read-only and inert. This evidence closes only the explicit-resolution smoke gate. It does not authorize UI rendering or automatic consumer invocation.

## Surface Tested

Desktop Studio Tauri WebView / AppleWebKit.

User agent:

```txt
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)
```

Timestamp:

```txt
2026-07-01T14:11:42.289Z
```

## Method

- The smoke invoked the real loaded consumer namespace: `H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(...)`.
- Flags were enabled non-destructively: the probe temporarily wrapped `H2O.flags.get` (returning `true` for the reader-notes flags) and did **not** call `H2O.flags.set`, so no flag state was persisted.
- Annotation input was controlled: the probe temporarily swapped `H2O.Studio.readerNotes.annotations` with a mock returning one attributed highlight.
- A detached fixture root (not attached to the live document) was used as the resolution root.
- Both the flag wrapper and the annotations slot were restored in a `finally` block:
  - `flagsRestored: true`
  - `annotationsRestored: true`
- Storage was instrumented for the duration of the call; no writes occurred (`storageWrites: []`).

## Captured Result

```json
{
  "schema": "h2o.readerNotes.a2a4c.explicitResolution.result.v1",
  "ok": true,
  "status": "explicit-resolution-smoke-passed",
  "checks": {
    "consumerPresent": true,
    "consumerDefaultEnabledBefore": false,
    "consumerEnabledDuringWrapper": true,
    "callSchemaVersion": 1,
    "resolvedCount": 1,
    "unresolvedCount": 0,
    "rowStatus": "anchored",
    "rowSpan": {
      "start": 6,
      "end": 24
    },
    "rowText": "some selected text",
    "rowSelectorUsed": "textQuote",
    "rowConfidence": 1,
    "rowHasRange": false,
    "rowHasAnnotation": false,
    "rowHasMsgEl": false,
    "rowJsonRoundTripStable": true,
    "xpathDeferred": true,
    "fixtureTextUnchanged": true,
    "fixtureHtmlUnchanged": true,
    "fixtureNodeCountUnchanged": true,
    "bodyUnchanged": true,
    "marksBefore": 0,
    "marksAfter": 0,
    "storageWrites": [],
    "flagsRestored": true,
    "annotationsRestored": true,
    "readerNotesKeysAfter": [
      "anchorResolver",
      "anchorResolverDom",
      "annotations",
      "highlightResolutionConsumer",
      "libraryItems"
    ]
  },
  "resolved": [
    {
      "annotationId": "highlight-a2a4c",
      "nativeId": "native-highlight-a2a4c",
      "answerId": "answer-a2a4c",
      "source": {
        "store": "highlights",
        "chatId": "chat-a2a4c",
        "answerId": "answer-a2a4c",
        "nativeId": "native-highlight-a2a4c",
        "convoId": "c/chat-a2a4c"
      },
      "status": "anchored",
      "span": {
        "start": 6,
        "end": 24
      },
      "selectorUsed": "textQuote",
      "confidence": 1,
      "reason": "textQuote-exact",
      "text": "some selected text",
      "diagnostics": {
        "tried": [
          "textQuote"
        ],
        "matchCount": 1,
        "approx": 6,
        "xpathDeferred": true,
        "notes": [
          "a2a4c-explicit-smoke"
        ]
      }
    }
  ],
  "unresolved": [],
  "errors": [],
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  "timestamp": "2026-07-01T14:11:42.289Z"
}
```

## Confirmed Checks

Real loaded consumer + controlled, non-destructive setup:

- Real loaded consumer namespace invoked: `H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(...)`.
- Consumer default-off before enable: `consumerDefaultEnabledBefore: false`.
- Consumer enabled only during the temporary flag wrapper: `consumerEnabledDuringWrapper: true`.
- `H2O.flags.get` was temporarily wrapped (not `H2O.flags.set`); no flags were persisted.
- `H2O.Studio.readerNotes.annotations` was temporarily swapped and restored.
- Both restored in `finally`: `flagsRestored: true`, `annotationsRestored: true`.
- No storage writes: `storageWrites: []`.
- Detached fixture root was used.

Explicit resolution result:

- `resolvedCount: 1`
- `unresolvedCount: 0`
- `status: anchored`
- `text: "some selected text"`
- `span: { start: 6, end: 24 }`
- `selectorUsed: textQuote`
- `confidence: 1`
- `reason: textQuote-exact`

Data-only row:

- no `range` (`rowHasRange: false`)
- no `annotation` (`rowHasAnnotation: false`)
- no `msgEl` (`rowHasMsgEl: false`)
- JSON round-trip stable (`rowJsonRoundTripStable: true`)

No mutation / no rendering:

- `bodyUnchanged: true`
- `marksBefore: 0`, `marksAfter: 0`
- fixture text/html/node-count unchanged (`fixtureTextUnchanged: true`, `fixtureHtmlUnchanged: true`, `fixtureNodeCountUnchanged: true`)

XPath:

- `xpathDeferred: true`

Live namespace restored:

```txt
anchorResolver
anchorResolverDom
annotations
highlightResolutionConsumer
libraryItems
```

## Boundaries

- This closes only the explicit-resolution smoke gate.
- This does not authorize UI rendering.
- This does not authorize automatic consumer invocation.
- No runtime/source modules were modified by A2a.4.2c.

## Deferred Work

- UI rendering remains deferred.
- Automatic consumer invocation remains deferred.
- XPath remains deferred.
- A2b remains deferred.
- Sidecar, enrichment, renderer, native_note, imported_document, converted_note, and saved-chat work remain deferred.
