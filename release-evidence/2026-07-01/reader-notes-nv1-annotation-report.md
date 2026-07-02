# Reader & Notes NV1 Annotation Report

## Scope

NV1 is a new non-visual Reader Notes lane. It adds a read-only Annotation Report consumer:

```txt
src-surfaces-base/studio/reader-notes/annotation-report.studio.js
```

NV1 is not an A2a rendering reopen. A2a remains closed/read-only/non-rendering.

S3H1a remains sole visible highlight renderer. A2a.6.1 rendering remains blocked.

XPath remains deferred. A2b remains deferred. MVP-B native notes remain out of scope.

## API

The module installs:

```js
H2O.Studio.readerNotes.annotationReport
```

with frozen read-only API:

```txt
isEnabled()
buildReport(itemId, options?)
selfCheck()
diagnose()
```

Feature flag:

```txt
studio.readerNotes.annotationReport.enabled
```

Operator opt-in key:

```txt
h2o.readerNotes.annotationReport.operatorOptIn
```

The module is triple gated:

- feature flag enabled
- operator opt-in present
- public release is off

The opt-in is read only through `localStorage.getItem`. NV1 persists nothing.

## Report

NV1 uses existing read-only A1/A2a APIs:

- `H2O.Studio.readerNotes.annotations.listForItem(...)`
- `H2O.Studio.readerNotes.highlightResolutionConsumer.resolveForItem(...)`

It returns serializable report data only:

```txt
schemaVersion
itemId
rootFound
highlights.resolved[]
highlights.orphaned[]
highlights.skipped[]
notes[]
bookmarks[]
counts
diagnostics
truncated
```

NV1 mutates no DOM, writes no storage, mutates no source data, writes no sidecar, creates no overlays, and renders nothing.

If a reader root is unavailable, highlights are skipped with `skipped-no-reader-root` and the report still returns safely.

`options.limit` truncates report rows safely and sets `truncated: true`.

## Product Use

NV1 provides an orphan-rate / anchor-quality baseline for future decisions. It is intended to help decide whether later A2b sidecar/enrichment work is justified.

Recommended sequencing:

1. NV1
2. MVP-B design gate
3. A2b only if NV1 metrics justify it
4. A3/rendering only if owner reopens Option A

## Deferred

Real-boot smoke is a separate future NV1b step; do not fabricate runtime output.

This evidence does not authorize rendering, XPath, A2b, sidecar, enrichment, renderer, native_note, imported_document, converted_note, saved-chat work, or reopening A2a.6.1.

## Validator

Canonical validator:

```txt
tools/validation/reader-notes/validate-reader-notes-mvp-nv1-annotation-report.mjs
```

It proves:

- static no-render/no-write policy
- frozen API install
- default-off behavior
- public-release refusal
- no auto-run on load
- no facade/consumer calls on load
- no DOM mutation at load
- no storage writes at load
- no event listeners, timers, observers, or subscriptions at load
- serializable report shape
- notes and bookmarks are included
- resolved/orphaned highlights are included
- no live DOM nodes, Range, or annotation references escape
- no-reader-root skip behavior
- missing dependencies fail closed
- `options.limit` truncation
- prior Reader & Notes validators still pass
