# tools/product/extensions/gemini/chrome/ — FUTURE PLACEHOLDER

Builder for the future gemini+chrome extension. Not yet implemented.

## When this gets populated

When Gemini support is added to the H2O product line, this folder gets a
`build.mjs` that reads from
[`../../../../src/extensions/gemini/chrome/`](../../../../src/extensions/gemini/chrome/)
and writes to `apps/extensions/gemini/chrome/<variant>/`.

Chrome manifest template will come from `../_shared/manifest-chrome.mjs`
(also future).

## Pattern

```
src/extensions/gemini/chrome/   →   tools/product/extensions/gemini/chrome/build.mjs   →   apps/extensions/gemini/chrome/<variant>/
                                                                                                    ↓
                                                                              Chrome chrome://extensions → Load unpacked
```

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
