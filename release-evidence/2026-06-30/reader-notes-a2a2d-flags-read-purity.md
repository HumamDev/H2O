# Reader & Notes A2a.2d Flags Read-Purity Evidence

## Purpose

A2a.2d proves the flags read-purity prerequisite before any future runtime exposure of the un-wired A2a resolver modules.

This is an evidence and validator slice only. It does not authorize loader/pack wiring.

## Scope

Audited sources:

```txt
src-surfaces-base/studio/S0F1k. 🎬 Library Canonical Services - Studio.js
src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js
src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js
```

Created validator:

```txt
tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2d-flags-read-purity.mjs
```

The validator resolves the `S0F1k` filename defensively by prefix, slices only the real flag registry region between stable markers, and evaluates that slice in an instrumented VM sandbox. It does not evaluate the full `S0F1k` module.

## Result

`H2O.flags.get(key, fallback)` is read-pure under behavioral audit.

H2O.flags.get(key, fallback) is read-pure.

Specifically:

- `ensureFlags()` boot may read localStorage via `getItem`, but does not write.
- `get()` does not persist defaults.
- `get()` does not mutate `flagState.values`.
- `get()` does not call storage write APIs.
- `get()` does not emit listener/event side effects.
- `set()` is the only proven write path and was used as the write-detection control.
- Resolver `isEnabled()` is write-free against both mock flags and real sliced `H2O.flags.get`.
- A2a modules remain un-wired.

ensureFlags() boot may read localStorage via getItem, but does not write.

get() does not persist defaults.

set() is the only proven write path.

## Behavioral Proofs

The validator proves:

- Boot installs `H2O.flags` from the real sliced registry source.
- Boot performs no `setItem`, `removeItem`, or `clear`.
- Missing key with fallback `false` returns `false` without writes or key mutation.
- Missing key with fallback `true` returns `true` without writes or key mutation.
- Existing key `false` returns `false` without writes.
- Existing key `true` returns `true` without writes.
- The `set()` control records `setItem` and changes `diagnose().keys`, proving the harness detects writes.
- Resolver `isEnabled()` returns `false` for missing flags, malformed flags, throwing `get`, and false flag values.
- Resolver `isEnabled()` returns `true` only when the resolver flag is true.
- Resolver `isEnabled()` uses `studio.readerNotes.anchorResolver.enabled`.
- Resolver `isEnabled()` calls no mock write methods.
- Resolver `isEnabled()` causes no storage writes when backed by the real sliced `H2O.flags.get`.

## Boundary Checks

The validator confirms the A2a modules remain un-wired:

```txt
src-surfaces-base/studio/studio.html
tools/product/studio/pack-studio.mjs
```

Neither file loads or packs:

```txt
reader-notes/anchor-resolver.studio.js
reader-notes/anchor-resolver-dom.studio.js
```

## Deferred Work

Loader/pack exposure still requires a separate reviewed A2a.3 slice.

Still deferred:

- XPath
- A1 integration
- A2b
- sidecar
- enrichment
- renderer
- native_note
- imported_document
- converted_note

No runtime/source modules were modified.
