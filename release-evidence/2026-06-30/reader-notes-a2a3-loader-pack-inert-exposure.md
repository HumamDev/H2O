# Reader & Notes A2a.3 Loader/Pack Inert Exposure Evidence

## Purpose

A2a.3 exposes the resolver modules inertly through loader/pack only.

This slice wires the already-reviewed read-only resolver modules into Studio loading and packaging. It does not add UI consumers, A1 integration, XPath, A2b sidecar, enrichment, renderer, native_note, imported_document, converted_note, or saved-chat behavior.

## Files Wired

Studio loader:

```txt
src-surfaces-base/studio/studio.html
```

Pack lists:

```txt
tools/product/studio/pack-studio.mjs
```

Resolver modules exposed:

```txt
reader-notes/anchor-resolver.studio.js
reader-notes/anchor-resolver-dom.studio.js
```

## Loader Order

The Reader & Notes runtime order is:

```txt
reader-notes/library-item-view.studio.js
reader-notes/annotation-facade.studio.js
reader-notes/anchor-resolver.studio.js
reader-notes/anchor-resolver-dom.studio.js
```

The same order is present in both `ARCHIVE_WORKBENCH_SOURCE_FILES` and `ARCHIVE_WORKBENCH_OUT_FILES`, with matching source/out indices.

## Prerequisite Gates

- Chrome/Blink proof gate already passed.
- Tauri/WebKit proof gate already closed.
- flags.get read-purity gate already passed.

## Inertness Result

The feature flag remains default off:

```txt
studio.readerNotes.anchorResolver.enabled
```

The A2a.3 validator proves:

- Resolver APIs are installed frozen.
- `isEnabled()` is false with missing/default-off flags.
- No DOM/storage writes occur during module load.
- No UI consumer is invoked.
- No A1 integration is implemented.
- No XPath is implemented.
- Existing no-consumer scan passed.
- The resolver modules are exposed only as read-only namespaces.

## Boundaries

This evidence does not authorize:

- A1 integration
- XPath
- A2b
- sidecar
- enrichment
- renderer
- native_note
- imported_document
- converted_note
- saved-chat work

A2a.3b real-boot namespace-installation confirmation is required before any consumer slice.

## Rollback

Rollback path:

1. Remove the two resolver script entries from `src-surfaces-base/studio/studio.html`.
2. Remove the two resolver entries from both pack lists in `tools/product/studio/pack-studio.mjs`.

No persisted data or runtime stores are involved.
