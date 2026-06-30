# Saved Chat Archive - Phase J.2 Desktop Export / Share Action

Status: **J.2 DESKTOP EXPORT SHARE ACTION - PASSED**

Lane: H2O Studio Chat Saving Architecture - Phase J export/share.

Baseline:

- J.0 contract: `2b41b83 docs(studio): define archive export share contract`
- J.1 validator: `66d170d test(studio): validate archive export share contract`

## Implementation Summary

J.2 adds a Desktop-only archive exporter module:

- `H2O.Studio.archiveExporter`
- `dryRunExportPackage({ packagePath, exportName? })`
- `exportVerifiedPackage({ packagePath, exportName? })`
- `renderArchiveExporterCard(...)`
- `mountArchiveExporterCard(...)`

The exporter mounts as a sibling near Archive Health / Archive Inspector / Archive Importer. The Archive Health card remains read-only; the exporter module owns the explicit export action and its bounded filesystem write.

## Capability Summary

Added dedicated capability:

- `apps/studio/desktop/src-tauri/capabilities/archive-export.json`

The capability is scoped only to:

- `$HOME/H2O Studio Exports`
- `$HOME/H2O Studio Exports/**`

Allowed operations are limited to the J.2 export flow:

- `fs:allow-mkdir`
- `fs:allow-exists`
- `fs:allow-read-dir`
- `fs:allow-write-file`
- `fs:allow-remove` for best-effort cleanup of failed temp exports
- `fs:allow-rename` for temp-to-final atomic handoff

No broad `$HOME/**` write scope, no `$DOWNLOAD/**` write scope, and no `$APPLOCALDATA/archive/packages` export-destination scope was added.

## Bounded Root Decision

J.2 uses a fixed internal export root:

- `$HOME/H2O Studio Exports/`

There is no OS directory picker, no arbitrary destination path, no Downloads export root, and no broad home-folder write access in this slice.

## Manifest-Driven Copy Strategy

The exporter never recursively blind-copies a package folder.

It copies only:

- `manifest.json`
- `manifest.files.snapshot.path`
- `manifest.files.markdown.path`
- `manifest.files.html.path`
- declared `manifest.assets[].path`

Package-relative paths are guarded:

- no absolute paths
- no `..`
- no backslashes
- no leading `/`
- assets must remain under `assets/`
- asset path sha must match `manifest.assets[].sha256`

## Atomic Write Behavior

The export flow writes to a temp package directory under `$HOME/H2O Studio Exports/`, verifies copied file hashes/content hash, then renames the temp directory to the final `.h2ochat` destination.

The final destination is rejected if it already exists.

## No-Overwrite Behavior

`dryRunExportPackage` and `exportVerifiedPackage` reject an existing destination with `destination-exists`.

The exporter never mutates or deletes the source package.

## Validator Changes

`tools/validation/studio/validate-saved-chat-archive-export-share-v1.mjs` now validates the J.2 implementation rather than only the J.1 contract-only state.

It asserts:

- exporter module and APIs exist
- Desktop gate and `inspectPackage` verification gate exist
- fixed bounded root is used
- no arbitrary destination root exists
- `archive-export.json` is scoped only to `$HOME/H2O Studio Exports`
- manifest-driven copy exists
- path traversal guards exist
- no blind recursive copy exists
- no-overwrite and temp-to-rename strategy exist
- Chrome runtime has no package-body authority
- `export-bundle.tauri.js` remains the full-library bundle exporter

`tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs` was updated to allow only the bounded J.2 exporter while keeping broad placeholder export/share names forbidden.

## Runtime Smoke Status

Full runtime export proof is deferred to J.3.

J.2 was validated statically because this slice adds the runtime action and bounded capability, but does not require a Desktop relaunch/export smoke. J.3 should run the real Desktop export flow against a verified package and confirm the exported copy passes inspection.

## Authority Boundaries

Chrome authority did not expand:

- no Chrome runtime/service-worker changes
- no Chrome package-body read/export/share authority
- no Chrome CAS access
- no Chrome contentHash computation

Full-bundle export remains separate:

- `export-bundle.tauri.js` still exports `h2o.studio.fullBundle.v2`
- `.h2ochat` single-package export is owned by `archiveExporter`

## Validation Results

Passed:

- `node --check src-surfaces-base/studio/ingestion/saved-chat-archive-exporter.studio.js`
- `node --check src-surfaces-base/studio/ingestion/archive-health-ui.studio.js`
- `node --check tools/validation/studio/validate-saved-chat-archive-export-share-v1.mjs`
- `node --check tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node --check tools/product/studio/pack-studio.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-export-share-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `node tools/validation/studio/validate-studio-archive-health-ui.mjs`
- JSON parse of `apps/studio/desktop/src-tauri/capabilities/archive-export.json`
- `git diff --check`
- `git diff --cached --check`

## Deferred

- J.3 real Desktop runtime export smoke
- zip/single-file package format
- OS share sheet
- cloud/WebDAV/sync propagation
- restore/relink
- Chrome package-body export/share authority
