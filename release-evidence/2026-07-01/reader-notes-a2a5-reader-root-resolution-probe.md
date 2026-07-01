# Reader & Notes A2a.5 Reader-Root Resolution Probe

## Scope

A2a.5 is an operator diagnostic probe only. It adds one inert, read-only module:

```txt
src-surfaces-base/studio/reader-notes/highlight-resolution-ui.studio.js
```

It installs:

```js
H2O.Studio.readerNotes.highlightResolutionUi
```

with API `isEnabled() / probe(options?) / selfCheck() / diagnose()`, frozen and `readonly: true`.

The module is loaded last, after the consumer:

```txt
reader-notes/library-item-view.studio.js
reader-notes/annotation-facade.studio.js
reader-notes/anchor-resolver.studio.js
reader-notes/anchor-resolver-dom.studio.js
reader-notes/highlight-resolution-consumer.studio.js
reader-notes/highlight-resolution-ui.studio.js
```

## Behavior

`probe(options?)` is explicit invocation only. There is No rendering and no automatic invocation.

The probe:

- locates the live saved-reader root `#viewReader` then `.cgFrame`
- derives `itemId` from `frame.dataset.chatId`
- calls the existing read-only consumer `H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(itemId, frame, options)`
- returns/logs data-only rows (schemaVersion, status, itemId, rootFound, resolvedCount, unresolvedCount, result, diagnostics)
- returns no live DOM nodes, no `Range`, no annotation objects, no `msgEl`

Result shape:

```txt
{ schemaVersion, status, itemId, rootFound, resolvedCount, unresolvedCount, result, diagnostics }
```

## Guarding

The probe is gated by all of:

- flag `studio.readerNotes.highlightResolutionUi.enabled` (default off)
- operator opt-in key `h2o.readerNotes.highlightResolutionUi.operatorOptIn` present/true in localStorage (this module only READS it; the operator sets it manually in a dev console)
- public release being off (`H2O.Studio.release.publicRelease !== true`; on error it fails closed and refuses)

The module never writes the opt-in key, never calls `localStorage.setItem`/`removeItem`/`clear`, and never persists anything.

## Safety

A2a.5 performs:

- No rendering
- No marks or overlays
- No DOM mutation
- No captured turn DOM mutation
- No storage writes
- No sidecar state writes
- No source mutation
- No `reanchorStatus` persistence
- No XPath / no `document.evaluate`
- No auto-run, no event listeners, no timers, no observers, no subscriptions at load
- No `studio.js` changes

The probe only reads the live reader root and delegates resolution to the already-proven read-only consumer, then returns data-only rows.

## Validator

The canonical validator is:

```txt
tools/validation/reader-notes/validate-reader-notes-mvp-a2a_5-reader-root-resolution-probe.mjs
```

It proves: module install/frozen/default-off; `flagKey`/`optInKey` correct; `isEnabled()` requires flag AND opt-in AND non-public-release; no auto-run / no consumer calls / no listeners / no timers / no observers / no storage writes / no DOM mutation at load; disabled, public-release-disabled, missing `#viewReader`, missing `.cgFrame`, missing `frame.dataset.chatId`, and missing consumer all fail closed without invoking the consumer; a valid probe calls `resolveForItem(itemId, frame, options)` and returns data-only rows with no live DOM nodes; consumer-throw is caught; no marks/overlays/DOM mutation across probe; and `diagnose()` advertises `rendersUi:false`, `mutatesDom:false`, `returnsLiveNodes:false`, XPath deferred. It also updates and re-runs the A2a.3 gate and the full A1/A2a suite.

The A2a.3 validator now allows exactly one additional consumer-of-consumer module (`reader-notes/highlight-resolution-ui.studio.js`); the no-consumer scan remains strict for every other Studio source file.

## Deferred

- UI rendering is deferred to A2a.6.
- A2a.5b real-boot smoke is required before any rendering slice (prove the probe resolves against the real reader root in Tauri/WebKit with no DOM mutation).
- Overlay rendering must later respect `STUDIO_OVERLAY_CONTRACT.md` and not mutate captured turn DOM; it must render into a separate, removable overlay layer.
- XPath remains deferred.
- A2b remains deferred.
- sidecar, enrichment, renderer, native_note, imported_document, converted_note, and saved-chat work remain deferred.

## Rollback

1. Remove the `reader-notes/highlight-resolution-ui.studio.js` loader script from `src-surfaces-base/studio/studio.html`.
2. Remove the `reader-notes/highlight-resolution-ui.studio.js` entries from both pack lists in `tools/product/studio/pack-studio.mjs`.
3. Revert the A2a.3 validator allowed-probe update.
