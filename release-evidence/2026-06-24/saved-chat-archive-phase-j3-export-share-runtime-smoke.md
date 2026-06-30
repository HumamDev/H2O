# Saved Chat Archive - Phase J.3 Export / Share Runtime Smoke

Status: **J.3 EXPORT SHARE RUNTIME SMOKE - BLOCKED**

Lane: H2O Studio Chat Saving Architecture - Phase J export/share.

Implementation under test:

- `a5a7c18 feat(studio): add bounded archive export action`

## Blocker

The Desktop dev app was running, but this Codex session did not have a programmatic DevTools/WebView console bridge into the running Tauri WebView. No local debug endpoint was exposed by the Desktop process, and the Codex thread had no attached app terminal or browser inspector session.

Because J.3 requires executing:

- `H2O.Studio.archiveExporter.dryRunExportPackage(...)`
- `H2O.Studio.archiveExporter.exportVerifiedPackage(...)`

inside the real Desktop Studio / Tauri WebView runtime, the runtime smoke was not completed in this session.

No fallback filesystem copy was performed, because that would not prove the J.2 Desktop runtime API or Tauri capability path.

## Source Package Preflight

Selected source package:

- `archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`

Real AppLocalData path:

- `$HOME/Library/Application Support/org.h2o.studio.desktop/archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`

Source package exists and contains:

- `manifest.json`
- `snapshot.json`
- `chat.md`
- `chat.html`

Expected identity matched manifest:

- `chatId`: `69f0c5f3-30c4-83eb-9240-26331d09532b`
- `snapshotId`: `snap_1778516336177_wy9txv06`
- `schemaVersion`: `1`
- `payloadVersion`: absent / `null`
- `contentHash`: `sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec`
- `assets`: `0`

## Source Hash Proof

Observed source declared-file hashes:

- `manifest.json`: `sha256-0f54eb1516d7e047c21b8cfb2037f45ddc7996f867264f69a7f552ce6c39933d`
- `snapshot.json`: `sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec`
- `chat.md`: `sha256-55539182331c4b877f798501d892652035286fdc7d66b65c89f62d8831a7431d`
- `chat.html`: `sha256-ec6147f562c6a4ee308091c1ad19d067f60867467b1fbaa09c450108066b5e53`

Manifest-declared hashes:

- `manifest.files.snapshot.sha256`: `sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec`
- `manifest.files.markdown.sha256`: `sha256-55539182331c4b877f798501d892652035286fdc7d66b65c89f62d8831a7431d`
- `manifest.files.html.sha256`: `sha256-ec6147f562c6a4ee308091c1ad19d067f60867467b1fbaa09c450108066b5e53`

For this v1 asset-free package:

- `manifest.contentHash === manifest.files.snapshot.sha256`
- `manifest.contentHash === sha256(snapshot.json bytes)`

## Destination Preflight

Chosen J.3 export name:

- `j3-runtime-smoke-69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`

Expected bounded destination:

- `$HOME/H2O Studio Exports/j3-runtime-smoke-69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`

Observed before runtime:

- `$HOME/H2O Studio Exports/` did not exist.
- Final destination did not exist.

## Baseline Counts

Preflight counts:

- source archive package count: `19`
- `chats`: `41`
- `snapshots`: `29`
- `snapshot_turns`: `72`
- `saved_chat_archive_requests`: `71`

These counts were read before any export attempt. No Desktop export API was executed, so no post-export mutation comparison is available.

## Required Runtime Steps Still Needed

Run in Desktop Studio DevTools after relaunching/rebuilding the current app if needed:

```js
const packagePath = "archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat";
const exportName = "j3-runtime-smoke-69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat";

const dry = await H2O.Studio.archiveExporter.dryRunExportPackage({
  packagePath,
  exportName,
});
console.log("[j3-export-dry-run]", dry);

const exported = await H2O.Studio.archiveExporter.exportVerifiedPackage({
  packagePath,
  exportName,
});
console.log("[j3-export-result]", exported);

const again = await H2O.Studio.archiveExporter.exportVerifiedPackage({
  packagePath,
  exportName,
});
console.log("[j3-export-second-run]", again);
```

Expected:

- `dry.status === "export-ready"`
- `exported.status === "exported"`
- `exported.destinationPath` is under `H2O Studio Exports/`
- `again.status === "destination-exists"`
- no overwrite occurs

Then verify the exported package copy by recomputing hashes for all manifest-declared files and confirming the source package hashes/DB counts/source package count remain unchanged.

## Boundary Status

Preserved in this session:

- No runtime code changed.
- No zip implementation.
- No OS share sheet.
- No cloud/WebDAV/sync propagation.
- No restore/relink.
- No Chrome runtime/service-worker changes.
- No scanner/materializer/writer/importer changes.
- No capability changes.
- No source package mutation.
- No export destination mutation.
- No stash/f17/sync/appearance/ribbon files touched.

## Validation Results

Passed:

- `node tools/validation/studio/validate-saved-chat-archive-export-share-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `node tools/validation/studio/validate-studio-archive-health-ui.mjs`
- `git diff --check`
- `git diff --cached --check`

## Required Follow-Up

J.3 should be rerun from a Desktop Studio DevTools console, or with an explicit WebView console automation bridge, to produce a PASSED evidence note containing:

- dry-run result
- export result
- destination-exists second-run result
- exported file/hash proof
- no-mutation proof
- capability boundary proof
