# Claude host-adapter fixtures

This folder will hold captured HTML snippets of real Claude.ai DOM, used for
offline (Node) testing of the host adapter without a live browser.

## Status

Empty as of Phase 9A-3. Live captures land here in Phase 9A-2 (DOM
verification) and are referenced by the validator in
`tools/validation/host-adapters/validate-claude-adapter-contract.mjs`.

## Capture protocol

Operator captures DOM samples during the [CLAUDE_DOM_NOTES.md
§3](../../../../docs/architecture/CLAUDE_DOM_NOTES.md) snippets pass:

```js
// In DevTools, after running Snippet B and noting a turn container:
copy(document.querySelector('main').outerHTML);
```

Save to `fixtures/<scenario>.html`, e.g.:

```
fixtures/
├── README.md
├── S2-short-chat.html
├── S3-long-chat-top.html
├── S3-long-chat-bottom.html
├── S4-code-block.html
├── S5-attachment.html
├── S6-artifact.html
├── S7-project-chat.html
└── S8-streaming-final.html
```

## Privacy

Captured fixtures **may contain operator conversation content**. Treat all
files in this directory as private:

- Never commit a fixture that includes API keys, real names, emails, or
  proprietary code.
- Redact aggressively before committing. Replace user prompts with
  `[REDACTED PROMPT]` and assistant outputs with `[REDACTED RESPONSE]`,
  preserving DOM structure / classes / aria-labels but stripping text.

A future tool (`tools/validation/host-adapters/redact-fixture.mjs`, NOT yet
implemented) can automate this.

## Fixture loading from Node

The validator reads fixtures via `fs.readFileSync`, parses them with a
minimal regex/string-based stub, and exercises the adapter's pure functions
against them. Real DOM library (jsdom) is intentionally NOT a dependency —
the goal is fast, zero-install Node tests.
