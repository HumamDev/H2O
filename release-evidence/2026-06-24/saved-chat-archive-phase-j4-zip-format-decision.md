# Saved Chat Archive - Phase J.4 Zip / Single-File Export Decision

Status: **PHASE J.4 — ZIP / SINGLE-FILE EXPORT DEFERRED**

Lane: H2O Studio Chat Saving Architecture - Phase J export/share.

## Decision

Phase J will close on the proven Desktop folder-copy `.h2ochat` export. Zip / single-file `.h2ochat` export is deferred.

The current folder-copy export path is already runtime-proven:

- verified package
- bounded export to `$HOME/H2O Studio Exports/`
- destination read-back
- matching manifest-declared file hashes
- second export returns `destination-exists`

Zip is a sharing convenience, not a missing core archive capability. It is not required before restore/relink.

Export-only zip is rejected for Phase J because it would create a single-file artifact the importer cannot consume yet. Zip should be implemented later only as a full round-trip:

- zip export
- zip import
- runtime smoke proving the exported zip can be inspected and imported safely

## Reuse Finding

No Rust zip crate is currently present in the Desktop Tauri manifest. No JS zip dependency is currently present in the package manifests. Cargo.lock contains `crc32fast` transitively, but there is no archive zip writer/reader dependency selected for saved-chat export.

The project intentionally keeps dependencies minimal.

An existing dependency-free stored-mode ZIP writer pattern exists in:

- `src-surfaces-base/studio/overlay/overlay-docx-writer.studio.js`

That module already contains the relevant pure-JS ZIP pieces:

- `crc32`
- `buildZipEntry`
- local file header construction
- central directory assembly
- end-of-central-directory assembly
- byte-deterministic stored-mode ZIP output

Future zip export should generalize or reuse that approach rather than adding a dependency, if practical.

## Future Phase K Outline

Recommended future zip phase:

- **K.0 zip round-trip contract**
- **K.1 validator**
- **K.2 zip export using stored-mode manifest-driven packaging**
- **K.3 safe zip import**
  - zip-slip rejection
  - no absolute paths
  - no `..`
  - temp extraction only
  - `inspectPackage` verification before import
  - reuse `importVerifiedPackage`
- **K.4 runtime smoke**
  - folder package to zip
  - zip to temp extract
  - inspect verified
  - import harness
- **K.5 closure**

## Future Zip Format Recommendation

Recommended shape:

- file extension: `.h2ochat.zip`
- internal root: `<chatId>.h2ochat/`
- manifest unchanged
- include only manifest-declared files
- stored-mode only first
- no DEFLATE dependency unless the product explicitly needs compressed imports

The zip artifact should remain a transport/share container around the existing package format, not a second archive schema.

## Deferred Work

Deferred from Phase J:

- zip export/import
- OS share sheet
- cloud/WebDAV/sync propagation
- restore/relink
- Chrome package-body export/read authority

## Boundaries Preserved

This J.4 decision note preserves the current Phase J boundaries:

- no runtime code changed
- no capabilities changed
- no validators changed
- no Chrome authority expanded
- no scanner/materializer/writer/importer changed
- no sync/appearance/ribbon dirty files touched
- `stash@{0}` untouched
- f17 migration drift untouched

## Current Phase J Conclusion

The Desktop-owned folder-copy exporter is sufficient to close Phase J's core export/share lane:

- Desktop verifies the source package before export.
- Desktop writes only to the bounded export root.
- Desktop refuses silent overwrite.
- Desktop preserves package hashes and contentHash.
- Chrome remains without package-body export/read authority.

Zip should return as Phase K only when export and import are designed, validated, and smoke-tested together.
