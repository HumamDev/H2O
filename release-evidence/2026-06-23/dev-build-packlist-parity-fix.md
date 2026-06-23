# Dev Build Packlist Parity Fix

Date: 2026-06-23

## Purpose

Restore `node tools/dev/dev-all.mjs` after the Chrome live extension build failed with:

```text
archive workbench packlist mismatch: source=275 out=274
```

## Root Cause

`ARCHIVE_WORKBENCH_SOURCE_FILES` included the Desktop-only saved-chat package projector:

```text
ingestion/saved-chat-package-v1.tauri.js
```

`ARCHIVE_WORKBENCH_OUT_FILES` did not include the matching output path. The pack step checks these arrays as parallel source/output packlists before removing or copying archive workbench files, so the length mismatch failed the Chrome live extension build before copy/filtering could run.

This was not caused by filename sanitization, platform filtering, or missing source content. The source file exists and is tracked. The output packlist was missing the corresponding entry.

## Fix

Added the missing output packlist entry:

```text
ingestion/saved-chat-package-v1.tauri.js
```

The entry is aligned with the source packlist at index 52.

## Files Changed

- `tools/product/studio/pack-studio.mjs`

## Validation

Commands run:

```sh
node -e "import('./tools/product/studio/pack-studio.mjs').then((m)=>{const s=m.ARCHIVE_WORKBENCH_SOURCE_FILES; const o=m.ARCHIVE_WORKBENCH_OUT_FILES; console.log(JSON.stringify({source:s.length,out:o.length,sourceHas:s.includes('ingestion/saved-chat-package-v1.tauri.js'),outHas:o.includes('ingestion/saved-chat-package-v1.tauri.js'),indexSource:s.indexOf('ingestion/saved-chat-package-v1.tauri.js'),indexOut:o.indexOf('ingestion/saved-chat-package-v1.tauri.js')}, null, 2));})"
node tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs
node tools/dev/dev-all.mjs
```

Results:

- Packlist parity: `source:275`, `out:275`.
- Missing path restored: `ingestion/saved-chat-package-v1.tauri.js`.
- Source/output index alignment: `indexSource:52`, `indexOut:52`.
- Chrome live extension build: passed.
- `node tools/dev/dev-all.mjs`: passed.
