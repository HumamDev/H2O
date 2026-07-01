# Reader & Notes A2a.4.1 Consumer-Readiness Evidence

Date: 2026-07-01

## Verdict

A2a.4.1 is validator/evidence only. It proves that A1 attributed highlight annotations are resolver-ready and can be resolved by the A2a DOM resolver against a faithful saved-reader message element fixture.

No runtime module was added. No loader/pack changes were made. No `studio.js` changes were made.

This evidence does not authorize A2a.4.2, A1 integration, UI rendering, XPath, A2b, sidecar, enrichment, renderer, native_note, imported_document, converted_note, or saved-chat work.

## Source Evidence

A1 attributed highlights are resolver-ready because `raw.anchors` carries the native 3H1a nested selector shape:

```js
{
  textQuote: {
    exact: "some selected text",
    prefix: "alpha ",
    suffix: " omega",
    approx: 6
  },
  textPos: {
    start: 6,
    end: 24
  },
  xpath: {
    startXPath: "./div[1]/span[1]/text()[1]",
    startOffset: 0,
    endXPath: "./div[1]/strong[1]/text()[1]",
    endOffset: 4
  }
}
```

The validator checks the real A1 annotation facade source and confirms attributed highlight projection includes:

- `kind: "highlight"`
- `source.answerId`
- `source.chatId`
- `source.nativeId`
- `source.convoId`
- cloned `raw`
- native `raw.anchors`

The validator also checks the real 3H1a highlight engine source and confirms anchors are produced relative to the message element root with nested `textQuote`, `textPos`, and `xpath` selectors.

## Message Root Requirement

Resolution root must be the message element, matched by:

```txt
highlight.source.answerId -> [data-message-id] -> msgEl root
```

A2a.4.1 does not resolve against `.cgFrame` or `.cgScroll`. The saved-reader fixture models current reader conventions:

```txt
.cgFrame
.cgFrame[data-chat-id]
.cgScroll[data-testid="conversation-turns"]
[data-turn]
[data-message-author-role]
[data-message-id]
```

The positive proof passes the message element with:

```txt
[data-message-id="answer-a2a4"]
[data-message-author-role="assistant"]
```

to:

```js
H2O.Studio.readerNotes.anchorResolverDom.resolveHighlight(annotation, msgEl, options)
```

## Positive Resolution

With `studio.readerNotes.anchorResolver.enabled` enabled in the sandbox, the attributed highlight fixture resolves against the message element root:

```txt
status: anchored
selectorUsed: textQuote
confidence: 1
reason: textQuote-exact
span: { start: 6, end: 24 }
range.toString(): some selected text
```

XPath is present in the fixture but remains deferred; the validator asserts `document.evaluate` is not called.

## Exclusions

Notes/bookmarks and unattributed highlights are excluded.

A2a.4.1 considers only attributed highlights. The validator proves the consumer-readiness guard does not pass these annotation kinds into item-root resolution:

- unattributed highlights
- notes
- bookmarks

## Fail-Closed Proof

The validator proves safe orphaned results for:

- missing root
- unsupported annotation kind
- missing anchors
- disabled resolver flag

## No Mutation / No Writes

The validator proves:

- no DOM mutation
- no text mutation
- no node-count mutation
- no mark rendering
- no overlay insertion
- no storage writes
- no sidecar writes
- no source mutation
- no `reanchorStatus` persistence

## Existing Gates

Existing A2a.3 no-consumer gate remains valid. A2a.4.1 creates no runtime consumer module and adds no loader/pack wiring.

The validator invokes the existing A2a.3 inert loader/pack validator and keeps prior A2a/A1/A0 validators passing.

## Deferred Work

- A2a.4.2 read-only consumer adapter remains deferred.
- A1 integration remains deferred.
- UI rendering remains deferred.
- XPath remains deferred.
- A2b sidecar/enrichment remains deferred.
- Renderer, native_note, imported_document, converted_note, and saved-chat work remain deferred.
