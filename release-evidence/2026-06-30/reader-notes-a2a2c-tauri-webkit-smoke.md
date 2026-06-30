# Reader & Notes A2a.2c.1 Tauri WebKit Smoke Template

## Purpose

A2a.2c.1 creates a safe generator/template for a manual Tauri WebKit DevTools console smoke. It does not execute WebKit proof by itself.

Chrome/Blink real-DOM proof already exists in A2a.2b commit `7c874c5` (`test(reader-notes): add A2a real-DOM Chrome smoke evidence`).

## Gate Status

WebKit gate status: OPEN.

This document does not claim a WebKit PASS. Loader/pack runtime exposure remains blocked until A2a.2c.2 captures a real Tauri WebKit PASS with the JSON result inserted below.

This document does not authorize:

- loader/pack wiring
- A1 integration
- XPath implementation
- A2b sidecar work
- enrichment
- renderer registry work
- native_note or imported_document work

`H2O.flags.get` read-purity remains deferred to a future wiring slice. A2a.2c.1 uses a private mock flag object only.

## Files

Generator:

```txt
tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_tauri-webkit-smoke.mjs
```

Generated pasteable console harness, not committed:

```txt
/private/tmp/h2o-reader-notes-a2a2c-tauri-webkit-console-smoke.js
```

Source modules embedded into the generated harness with footer rewrite:

```txt
src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js
src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js
```

The generated harness rewrites only the module footer from:

```js
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

to:

```js
})(sandbox);
```

This installs both resolver modules into a private sandbox object rather than the live Studio namespace.

## Operator Steps

Generate the pasteable harness:

```sh
cd /Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source
node tools/validation/reader-notes/validate-reader-notes-mvp-a2a_2_tauri-webkit-smoke.mjs
```

Launch Desktop Studio:

```sh
cd /Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source/apps/studio/desktop
npm run tauri:dev
```

Then:

1. Open the Tauri WebView DevTools.
2. Paste the contents of `/private/tmp/h2o-reader-notes-a2a2c-tauri-webkit-console-smoke.js` into the Console.
3. Capture the returned JSON.
4. Paste the JSON into the `Captured WebKit Result` section below.
5. Record macOS version if available.
6. Record Tauri app/dev build context.
7. Record `navigator.userAgent`, assertion count, failures, and verdict.

## Pass Criteria

The captured JSON must satisfy:

- `schema === "h2o.readerNotes.a2a2c.tauriWebKitSmoke.result.v1"`
- `ok === true`
- `status === "tauri-webkit-smoke-passed"`
- `failures.length === 0`
- all required assertions are represented
- no live uppercase Studio namespace pollution is detected
- no live DOM body child-count pollution is detected
- no real flag writes are detected

## Fail Criteria

The WebKit gate stays open if any of these occur:

- any assertion failure
- any live uppercase Studio namespace mutation
- any real flag write
- any live DOM mutation
- any WebKit `Range.toString()` mismatch for normal single-node or cross-node cases
- XPath resolves unexpectedly
- missing JSON output
- inconclusive JSON output

## Required Assertions

The generated harness checks:

- A2a.1 core installs into `sandbox.H2O.Studio.readerNotes.anchorResolver`.
- A2a.2a DOM wrapper installs into `sandbox.H2O.Studio.readerNotes.anchorResolverDom`.
- disabled mock flag returns `status:"orphaned"`, `range:null`, `reason:"disabled"`.
- enabled mock flag allows resolution.
- `flattenRoot()` includes all non-empty text nodes.
- whitespace-only text nodes are included.
- `display:none` text is included.
- exact text is preserved.
- no separators are inserted.
- WebKit `Range.toString()` works inside one text node.
- WebKit `Range.toString()` works across multiple text nodes.
- `span` is returned beside `range`.
- content mismatch triggers the existing content-equality guard through `spanToRange()` and returns `null` materialization.
- detached DOM root text, node count, markup, and mark/overlay count are unchanged.
- XPath-only anchor remains deferred/unresolved and reports `xpathDeferred`.
- mock flag write recorder remains empty.
- live uppercase Studio namespace descriptor is unchanged.
- live `readerNotes` keys are unchanged if present.
- live document body child count is unchanged.

Detached-root limitation: the `display:none` assertion proves DOM text-node inclusion in WebKit, not rendered visibility behavior.

## Captured WebKit Result

Status: PENDING.

No real Tauri WebKit result has been captured in A2a.2c.1.

Paste the A2a.2c.2 console JSON here when run:

```json
{
  "schema": "h2o.readerNotes.a2a2c.tauriWebKitSmoke.result.v1",
  "ok": null,
  "status": "pending",
  "assertionCount": null,
  "failures": [],
  "userAgent": "",
  "timestamp": "",
  "notes": [
    "A2a.2c.1 template only; replace this block only after a real operator-run Tauri WebKit smoke."
  ]
}
```

## Boundaries

A2a.2c.1 changes no runtime source.

Explicitly unchanged:

- `src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js`
- `src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js`
- `src-surfaces-base/studio/reader-notes/library-item-view.studio.js`
- `src-surfaces-base/studio/reader-notes/annotation-facade.studio.js`
- `src-surfaces-base/studio/studio.html`
- `tools/product/studio/pack-studio.mjs`
- `apps/studio/desktop/src-tauri/**`
- stores
- `3H1a`
- `studio.js`
- sync/ingestion/saved-chat package paths

XPath remains deferred. A1 integration remains deferred. Loader/pack runtime exposure remains blocked until real WebKit PASS evidence is captured.
