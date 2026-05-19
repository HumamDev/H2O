# tools/product/extensions/claude/firefox/ — FUTURE PLACEHOLDER

Builder for the future claude+firefox extension. Not yet implemented.

## When this gets populated

When Firefox support is added to the Claude product line, this folder gets a
`build.mjs` that reads from
[`../../../../src/extensions/claude/firefox/`](../../../../src/extensions/claude/firefox/)
and writes to `apps/extensions/claude/firefox/<variant>/`.

Firefox manifest template will come from `../_shared/manifest-firefox.mjs`
(also future).

## Pattern

```
src/extensions/claude/firefox/   →   tools/product/extensions/claude/firefox/build.mjs   →   apps/extensions/claude/firefox/<variant>/
                                                                                                      ↓
                                                                            Firefox about:debugging → Load Temporary Add-on
```

## Where to read more

- [../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
