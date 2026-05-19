# tools/product/extensions/chatgpt/firefox/ — FUTURE PLACEHOLDER

Builder for the future chatgpt+firefox extension. Not yet implemented.

## When this gets populated

When Firefox support is added to the ChatGPT product line, this folder
gets a `build.mjs` that reads from
[`../../../../src/extensions/chatgpt/firefox/`](../../../../src/extensions/chatgpt/firefox/)
and writes to `apps/extensions/chatgpt/firefox/<variant>/`.

The Firefox manifest template will come from `../_shared/manifest-firefox.mjs`
(also future).

## Pattern

```
src/extensions/chatgpt/firefox/   →   tools/product/extensions/chatgpt/firefox/build.mjs   →   apps/extensions/chatgpt/firefox/<variant>/
                                                                                                      ↓
                                                                            Firefox about:debugging → Load Temporary Add-on
```

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
