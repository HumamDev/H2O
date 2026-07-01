# Folder Sync F11 - Render-Only Mirror Rebuild

Date: 2026-07-01

## Status

F11 RENDER-ONLY MIRROR REBUILD - PASS DETERMINISTIC IMPLEMENTATION/PROOF

This slice implements a narrowly scoped, manually invoked, dev/diagnostic-gated render-mirror rebuild
helper for only the two F10-approved safe classes:

- `missing-mirror-folder`
- `field-mismatch:color`

F10 design/spec commit referenced: `bc1a67e`.

## What Changed

Source changed:

- `src-surfaces-base/studio/store/folders.tauri.js`

New public store helper:

- `H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite(options)`

Required gate:

- `gate: "folder-sync-f11-render-only-mirror-rebuild"`

Write behavior:

- default mode is dry-run / preview.
- mirror write requires both the explicit gate and `apply: true`.
- write target is only `FOLDER_STATE_DATA_KEY`.
- no automatic call site was added.

## Canonical Model

- Desktop SQLite `folders` remains canonical.
- `FOLDER_STATE_DATA_KEY` remains a derived render mirror.
- The helper reads canonical Desktop SQLite folder rows through `listFolders()`.
- The helper reads the current render mirror through `chromeStorageGet(FOLDER_STATE_DATA_KEY)`.
- The helper writes only the render mirror with `chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState })` when explicitly applied.

## Handled Classes

`missing-mirror-folder`:

- if a canonical SQLite folder row is absent from `FOLDER_STATE_DATA_KEY.folders`, the helper appends a render row derived from SQLite.
- it initializes an empty mirror item bucket only when needed for the missing folder id.
- it does not create or move chat-folder bindings.

`field-mismatch:color`:

- if a mirror row exists and its render color differs from canonical SQLite, the helper updates only `color` and `iconColor`.
- it does not update `name`, `sortOrder`, bindings, tombstones, or SQLite.

## Explicitly Blocked

The helper does not rebuild:

- `field-mismatch:sortOrder`
- `binding-mismatch`

Blocked behavior:

- no SQLite writes.
- no chat-folder binding writes.
- no tombstone writes.
- no folder delete/purge.
- no sortOrder overwrite.
- no binding repair.
- no Chrome canonical mutation.
- no WebDAV/cloud/archive CAS.
- no Chat Saving code or package propagation.
- no `productSyncReady` flip.
- no `fullBundle.v3` mint.
- no catalog CRUD.
- no multi-writer.

## Diagnostics / Privacy

The helper returns a redacted/hash-only diagnostic result:

- schema: `h2o.studio.folder-sync.f11-render-only-mirror-rebuild.v1`
- diagnostics include classes and folder hash tokens only.
- no raw folder names.
- no raw chat titles/content.
- no account/user/mobile/peer raw identifiers.

## Cross-Surface Requirement

This keeps future sync compatibility across:

- Desktop Studio
- Chrome/native extension Studio across multiple devices
- mobile app

F11 does not implement mobile, remote WebDAV, relay, cloud object storage, Chat Saving CAS, or multi-device
authority. It preserves Desktop-canonical default authority, peer/device identity as future hash-only
metadata, shared folder/item envelopes, and redacted diagnostics.

## Product Readiness

- `productSyncReady`: remains `false`.
- Folder sync remains NOT READY.
- Public/premium sync remains blocked.
- Real remote WebDAV remains deferred.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Proof Summary

The F11 validator proves:

- the evidence references F10 commit `bc1a67e`.
- only `missing-mirror-folder` and `field-mismatch:color` are handled.
- `field-mismatch:sortOrder` and `binding-mismatch` remain blocked.
- the helper requires `folder-sync-f11-render-only-mirror-rebuild`.
- the helper writes only `FOLDER_STATE_DATA_KEY`.
- the helper uses `chromeStorageSet` only after explicit gate + `apply: true`.
- no SQLite execute, binding write, tombstone write, folder delete/purge, WebDAV/cloud/archive CAS, or Chat Saving package code path is introduced.
- a synthetic fixture rebuild adds a missing mirror row and repairs color while preserving sortOrder and bindings untouched.

## Verdict

F11 PASS: render-only mirror rebuild/write-through is implemented and proven for the two F10-approved safe
classes only. `sortOrder`, bindings, tombstones, deletes, Chrome canonical mutation, WebDAV/cloud/archive
CAS, Chat Saving propagation, and product readiness remain blocked.

## Recommended F12

F12 should run a disabled/manual Desktop Studio live proof:

- invoke `H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite({ gate: "folder-sync-f11-render-only-mirror-rebuild", apply: true })`.
- re-run the F6/F5 drift probe.
- prove `missing-mirror-folder` and `field-mismatch:color` clear.
- prove `field-mismatch:sortOrder` and `binding-mismatch` remain unchanged/blocked.
- prove mirror-only write count, no SQLite/binding/tombstone/transport writes, `productSyncReady:false`, and Chat Saving CAS blocked.
