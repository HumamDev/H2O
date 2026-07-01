# Reader & Notes A2a.4.2 Highlight Resolution Consumer

## Scope

A2a.4.2 creates one read-only explicit-invocation consumer module:

```txt
src-surfaces-base/studio/reader-notes/highlight-resolution-consumer.studio.js
```

It is loaded after the A1 and A2a resolver modules:

```txt
reader-notes/library-item-view.studio.js
reader-notes/annotation-facade.studio.js
reader-notes/anchor-resolver.studio.js
reader-notes/anchor-resolver-dom.studio.js
reader-notes/highlight-resolution-consumer.studio.js
```

The module installs:

```js
H2O.Studio.readerNotes.highlightResolutionConsumer
```

with API:

```txt
isEnabled()
resolveForItem(itemId, root, options?)
selfCheck()
diagnose()
```

The public API is frozen/read-only. The feature flag is:

```txt
studio.readerNotes.highlightResolutionConsumer.enabled
```

The flag defaults off. Own flag + upstream self-gating is the gating model: the consumer uses its own flag and relies on upstream self-gating by `annotations.listForItem(...)` and `anchorResolverDom.resolveHighlight(...)`.

## Behavior

`resolveForItem(itemId, root, options?)` is explicit invocation only. No auto-run occurs.

The consumer:

- calls `annotations.listForItem(itemId, { kind: 'highlight' })`
- accepts attributed highlights only
- maps `source.answerId` to a message element by enumerating `[data-message-id]` nodes and comparing `getAttribute('data-message-id')`
- does not interpolate `answerId` into a selector
- calls `anchorResolverDom.resolveHighlight(annotation, msgEl, options?)`
- returns data-only rows
- never returns a live `Range`
- No live `Range` return is exposed to callers
- uses `range.toString()` only internally to capture row text
- deep-clones returned `source` and `diagnostics`

Data-only rows contain serializable metadata only:

```txt
annotationId
nativeId
answerId
source
status
span
selectorUsed
confidence
reason
text
diagnostics
```

No row includes `range`, `annotation`, or `msgEl`.

## Exclusions

The consumer excludes notes/bookmarks/unattributed highlights before resolver invocation.

It does not support:

- notes
- bookmarks
- unattributed highlights
- unsupported annotation kinds
- missing anchors
- missing `source.answerId`

## Fail Closed

The consumer fails closed for:

- disabled consumer flag
- invalid item id
- missing root
- missing dependencies
- missing message root
- resolver disabled
- resolver orphaned
- resolver range unavailable
- thrown annotation dependency
- thrown resolver
- no highlights

Failures produce empty results or unresolved rows. They do not throw into reader paths.

## Safety

No UI rendering is added by A2a.4.2.

It performs:

- no DOM mutation
- no storage writes
- no source mutation
- no sidecar writes
- no `reanchorStatus` persistence
- no mark rendering
- no overlay insertion
- no XPath implementation
- no `document.evaluate`

It installs no load-time hooks, listeners, timers, observers, or subscriptions.

## Validator

The canonical validator is:

```txt
tools/validation/reader-notes/validate-reader-notes-mvp-a2a_4-highlight-resolution-consumer.mjs
```

It proves:

- module install and frozen API
- default-off behavior
- no auto-run at load
- no resolver or annotation calls at load
- no DOM mutation at load
- no storage writes at load
- no event listeners, timers, observers, or subscriptions at load
- happy-path attributed highlight resolution
- msgEl lookup by safe attribute comparison
- no live `Range` in returned rows
- JSON-serializable data-only rows
- deep-cloned source and diagnostics
- exclusion of notes/bookmarks/unattributed highlights
- fail-closed behavior
- XPath remains deferred
- no UI rendering, storage writes, sidecar writes, or source mutation

The A2a.3 validator now allows exactly one consumer module:

```txt
reader-notes/highlight-resolution-consumer.studio.js
```

The no-consumer gate remains strict for every other Studio source file and UI path.

## Deferred

A2a.4.2b real-boot smoke is required before any UI consumer slice.

This evidence does not authorize UI rendering, XPath, A2b, sidecar, enrichment, renderer, native_note, imported_document, converted_note, or saved-chat work.

## Rollback

Rollback path:

1. Remove the loader script entry from `src-surfaces-base/studio/studio.html`.
2. Remove the consumer entries from both pack lists in `tools/product/studio/pack-studio.mjs`.
3. Revert the A2a.3 validator allowed-consumer update.
