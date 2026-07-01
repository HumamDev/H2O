# Reader & Notes A2a.3b Real-Boot Namespace Installation Evidence

Date: 2026-07-01

Baseline commit:

```txt
eb1ed84 feat(reader-notes): add A2a.3 inert loader-pack exposure
```

## Verdict

MVP-A2a.3b real-boot namespace-installation gate is CLOSED.

The proof was captured in a real Desktop Studio Tauri WebView boot using AppleWebKit. This evidence closes only the real-boot namespace-installation gate. It does not authorize A1 consumer integration by itself; that still requires a separate reviewed slice.

## Surface Tested

Desktop Studio Tauri WebView / AppleWebKit.

User agent:

```txt
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)
```

Timestamp:

```txt
2026-07-01T09:45:10.065Z
```

## Captured Result

```json
{
  "schema": "h2o.readerNotes.a2a3b.realBootNamespace.result.v1",
  "ok": true,
  "status": "real-boot-namespace-passed",
  "checks": {
    "readerNotesPresent": true,
    "libraryItemsPresent": true,
    "annotationsPresent": true,
    "corePresent": true,
    "domPresent": true,
    "coreInstalled": true,
    "domInstalled": true,
    "coreFrozen": true,
    "domFrozen": true,
    "coreFlagKey": "studio.readerNotes.anchorResolver.enabled",
    "domFlagKey": "studio.readerNotes.anchorResolver.enabled",
    "coreEnabled": false,
    "domEnabled": false,
    "domCoreAvailable": true,
    "domDeferredSelectors": [
      "xpath"
    ]
  },
  "readerNotesKeys": [
    "anchorResolver",
    "anchorResolverDom",
    "annotations",
    "libraryItems"
  ],
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  "timestamp": "2026-07-01T09:45:10.065Z"
}
```

## Confirmed Checks

- `H2O.Studio.readerNotes` exists.
- `libraryItems` exists.
- `annotations` exists.
- `anchorResolver` exists.
- `anchorResolverDom` exists.
- Both resolver APIs are installed.
- Both resolver APIs are frozen.
- Both flag keys equal `studio.readerNotes.anchorResolver.enabled`.
- Both `isEnabled()` calls are false by default.
- `anchorResolverDom.diagnose().coreAvailable === true`.
- XPath remains deferred via `domDeferredSelectors: ["xpath"]`.
- Final `readerNotesKeys` are exactly `anchorResolver`, `anchorResolverDom`, `annotations`, and `libraryItems`.

## Deferred Work

- No A1 integration was implemented.
- No XPath was implemented.
- No A2b work was started.
- No sidecar, enrichment, renderer, native_note, imported_document, converted_note, or saved-chat work was started.

## Rollback

To roll back A2a.3 inert exposure:

- Remove the two resolver script entries from `src-surfaces-base/studio/studio.html`.
- Remove the two resolver entries from both lockstep lists in `tools/product/studio/pack-studio.mjs`.
