# Retirement — Input Dock (Keys Rail)

| Field | Value |
|---|---|
| Identifier | `8y1a.input.dock.keys.rail` |
| Original path | `src-runtime-base/8Y1a.🟣🧊 Input Dock (Keys Rail).js` |
| Retired path | `retired-features/input-dock-keys-rail/8Y1a.🟣🧊 Input Dock (Keys Rail).js` |
| Date | 2026-08-06 |
| Base commit | `923da37e4c6c8b098a410a21abac735047ea2fad` |

## Reason

No longer part of the intended project design.

## Active loader/registry entries removed

- `config/dev-order.tsv` — the `🟢 8Y1a.🟣🧊 Input Dock (Keys Rail).js` row (entries 150 → 149)
- `config/loader-deps.json` — the `8Y1a._Input_Dock_(Keys_Rail)_.js` entry (scripts 150 → 149)

The file now lives under `retired-features/`, which no build or loader tool
scans (`tools/loader/make-aliases.mjs` reads only `src-runtime-base/`), so no
alias is generated and the loader cannot inject it.

## Rollback

```bash
git mv "retired-features/input-dock-keys-rail/8Y1a.🟣🧊 Input Dock (Keys Rail).js" "src-runtime-base/8Y1a.🟣🧊 Input Dock (Keys Rail).js"
git checkout 923da37e4c6c8b098a410a21abac735047ea2fad -- config/dev-order.tsv config/loader-deps.json
node tools/loader/make-aliases.mjs
```
