# tools/product/extensions/gemini/firefox/ — FUTURE PLACEHOLDER

Builder for the future gemini+firefox extension. Not yet implemented.

## When this gets populated

When Firefox support is added to the Gemini product line, this folder gets a
`build.mjs` that reads from
[`../../../../src/extensions/gemini/firefox/`](../../../../src/extensions/gemini/firefox/)
and writes to `apps/extensions/gemini/firefox/<variant>/`.

Firefox manifest template will come from `../_shared/manifest-firefox.mjs`
(also future).

## Pattern

```
src/extensions/gemini/firefox/   →   tools/product/extensions/gemini/firefox/build.mjs   →   apps/extensions/gemini/firefox/<variant>/
                                                                                                      ↓
                                                                            Firefox about:debugging → Load Temporary Add-on
```

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
