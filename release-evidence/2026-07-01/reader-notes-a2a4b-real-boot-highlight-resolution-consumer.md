# Reader & Notes A2a.4.2b Real-Boot Highlight Resolution Consumer Inertness Evidence

Date: 2026-07-01

Baseline commit:

```txt
c540113 feat(reader-notes): add A2a.4.2 read-only highlight consumer
```

## Verdict

MVP-A2a.4.2b real-boot consumer-inertness gate is CLOSED.

The proof was captured in a real Desktop Studio Tauri WebView boot using AppleWebKit. This evidence closes only the real-boot consumer-inertness gate. It does not authorize UI rendering or automatic consumer invocation; a UI consumer slice still requires a separate reviewed slice.

## Surface Tested

Desktop Studio Tauri WebView / AppleWebKit.

User agent:

```txt
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)
```

Timestamp:

```txt
2026-07-01T12:36:25.137Z
```

## Captured Result

```json
{
  "schema": "h2o.readerNotes.a2a4b.realBootConsumer.result.v1",
  "ok": true,
  "status": "real-boot-consumer-inert-passed",
  "checks": {
    "readerNotesPresent": true,
    "libraryItemsPresent": true,
    "annotationsPresent": true,
    "anchorResolverPresent": true,
    "anchorResolverDomPresent": true,
    "consumerPresent": true,
    "consumerInstalled": true,
    "consumerFrozen": true,
    "consumerReadonly": true,
    "consumerFlagKey": "studio.readerNotes.highlightResolutionConsumer.enabled",
    "consumerEnabledDefault": false,
    "consumerDiagnose": {
      "ok": true,
      "version": 1,
      "readonly": true,
      "flagKey": "studio.readerNotes.highlightResolutionConsumer.enabled",
      "enabled": false,
      "supported": [
        "resolveForItem"
      ],
      "supportedKinds": [
        "highlight"
      ],
      "exclusions": [
        "unattributed",
        "note",
        "bookmark"
      ],
      "returnsLiveRange": false,
      "xpath": "deferred",
      "noRender": true,
      "annotationsAvailable": true,
      "resolverAvailable": true,
      "upstream": {
        "annotationsEnabled": false,
        "resolverEnabled": false
      },
      "lastDiagnostics": null,
      "errors": []
    },
    "readerNotesKeys": [
      "anchorResolver",
      "anchorResolverDom",
      "annotations",
      "highlightResolutionConsumer",
      "libraryItems"
    ],
    "markBefore": 0,
    "markAfter": 0,
    "bodyUnchanged": true
  },
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  "timestamp": "2026-07-01T12:36:25.137Z"
}
```

## Confirmed Checks

Namespace presence:

- `H2O.Studio.readerNotes` exists.
- `libraryItems` exists.
- `annotations` exists.
- `anchorResolver` exists.
- `anchorResolverDom` exists.
- `highlightResolutionConsumer` exists.

Consumer API contract:

- consumer API is installed (`__installed === true`).
- consumer API is frozen (`Object.isFrozen(...) === true`).
- consumer API is readonly (`readonly === true`).
- consumer flag key is `studio.readerNotes.highlightResolutionConsumer.enabled`.
- consumer is default-off: `isEnabled() === false`.

Consumer diagnose contract:

- `consumerDiagnose.returnsLiveRange === false`.
- `consumerDiagnose.xpath === "deferred"`.
- `consumerDiagnose.noRender === true`.
- `consumerDiagnose.annotationsAvailable === true`.
- `consumerDiagnose.resolverAvailable === true`.
- `consumerDiagnose.errors` is empty.
- `consumerDiagnose.upstream.annotationsEnabled === false` and `consumerDiagnose.upstream.resolverEnabled === false` (upstream modules remain default-off; the consumer relies on upstream self-gating).

Reader & Notes keys observed:

```txt
anchorResolver
anchorResolverDom
annotations
highlightResolutionConsumer
libraryItems
```

Inertness / no mutation:

- mark/overlay count unchanged: `markBefore: 0`, `markAfter: 0`.
- body unchanged: `bodyUnchanged: true`.

## Inertness Statement

No auto-run, no UI mutation, and no mark/overlay rendering were observed at boot. The consumer module attaches a frozen read-only namespace and performs no resolution unless `resolveForItem(...)` is explicitly invoked.

## Boundaries

- This closes only the real-boot consumer-inertness gate.
- This does not authorize UI rendering.
- This does not authorize automatic consumer invocation.
- An explicit-resolution smoke (invoking `resolveForItem` against a real captured highlight and a real reader message-element root with the flags enabled) is not performed here and, if desired, remains a separate future proof.
- No runtime/source modules were modified by A2a.4.2b.

## Deferred Work

- UI rendering remains deferred.
- XPath remains deferred.
- A2b remains deferred.
- Sidecar, enrichment, renderer, native_note, imported_document, converted_note, and saved-chat work remain deferred.
