# tools/product/extensions/claude/chrome/ — FUTURE PLACEHOLDER

Builder for the future claude+chrome extension. Not yet implemented.

## When this gets populated

When Claude support is added to the H2O product line, this folder gets a
`build.mjs` that reads from
[`../../../../src/extensions/claude/chrome/`](../../../../src/extensions/claude/chrome/)
and writes to `apps/extensions/claude/chrome/<variant>/`.

Chrome manifest template will come from `../_shared/manifest-chrome.mjs`
(also future).

## Pattern

```
src/extensions/claude/chrome/   →   tools/product/extensions/claude/chrome/build.mjs   →   apps/extensions/claude/chrome/<variant>/
                                                                                                    ↓
                                                                              Chrome chrome://extensions → Load unpacked
```

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
