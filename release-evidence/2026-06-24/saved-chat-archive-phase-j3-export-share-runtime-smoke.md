# Saved Chat Archive - Phase J.3 Export / Share Runtime Smoke

Date: 2026-06-30

Status: **J.3 EXPORT SHARE RUNTIME SMOKE - PASSED**

Lane: H2O Studio Chat Saving Architecture - Phase J export/share.

Implementation under test:

- `a5a7c18 feat(studio): add bounded archive export action`

Read-back capability fix landed during this smoke:

- `71b6113 fix(studio): allow bounded archive export readback` — added bounded
  `fs:allow-read-file` for `$HOME/H2O Studio Exports/**` so the Desktop runtime can read
  back exported files for post-copy destination verification.

The final minimal Desktop Studio / Tauri DevTools confirmation has now **passed**: the
exported destination reads back under the bounded export root, the exported manifest
`contentHash` and snapshot hash match the expected value, and a same-name second export
returns `destination-exists` with no overwrite.

## Blocker history (preserved)

1. **Initially blocked** — the Tauri WKWebView exposes no remote debug / console bridge
   this environment can drive, so the J.3 runtime is operator-run (same constraint as
   F.3 / G.3 / H.3); the first J.3 note recorded the blocked preflight (`2d17e32`).
2. **First operator run proved the export but read-back failed** — the export wrote the
   destination and the manifest-declared files matched the source byte-for-byte (verified
   in the terminal), but the in-app post-copy verification hit
   `forbidden path: …/H2O Studio Exports/…/manifest.json` — a bounded read-back capability
   gap (`archive-export.json` allowed create/write/remove/rename but not `read_file`).
3. **Bounded read-back capability added** — `71b6113` added `fs:allow-read-file` scoped
   only to `$HOME/H2O Studio Exports/**` (no broadening).
4. **Final minimal Desktop DevTools confirmation passed** — see below.

## Final runtime confirmation — PASSED

After rebuilding/relaunching Desktop with the bounded read-back capability, the operator
ran the minimal DevTools confirmation:

```text
{
  ok: true,
  destinationReadbackOk: true,
  manifestContentHash: "sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec",
  snapshotHash:        "sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec",
  secondExportStatus:  "destination-exists",
  noOverwriteConfirmed: true
}
```

- **Destination read-back now works** under the bounded export root.
- **Exported manifest `contentHash` matches** the expected
  `sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec`.
- **Exported snapshot hash matches** manifest / `contentHash` (v1 asset-free:
  `contentHash === files.snapshot.sha256`).
- **Re-exporting with the same `exportName` returns `destination-exists`** — no overwrite.

## Runtime Summary

The operator ran the J.3 Desktop Studio / Tauri DevTools export snippet. The snippet failed during destination hash verification with:

```text
forbidden path: /Users/hobayda/H2O Studio Exports/j3-runtime-smoke-69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat/manifest.json
```

This was not treated as an exporter failure. Terminal inspection showed that the export destination was created and the manifest-declared files matched the source package byte-for-byte by SHA-256.

The failure was a bounded read-back capability gap: `archive-export.json` allowed creating, writing, removing, and renaming under `$HOME/H2O Studio Exports/**`, but did not allow `read_file` for post-copy destination verification.

## Source Package

Selected source package:

- `archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`

Real AppLocalData path:

- `$HOME/Library/Application Support/org.h2o.studio.desktop/archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`

Expected identity:

- `chatId`: `69f0c5f3-30c4-83eb-9240-26331d09532b`
- `snapshotId`: `snap_1778516336177_wy9txv06`
- `schemaVersion`: `1`
- `payloadVersion`: absent / `null`
- `contentHash`: `sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec`
- `assets`: `0`

## Destination Proof

Export name:

- `j3-runtime-smoke-69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`

Observed destination:

- `$HOME/H2O Studio Exports/j3-runtime-smoke-69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat`

Destination existed after the operator-run Desktop export attempt and contained exactly the v1 manifest-declared package files:

- `manifest.json`
- `snapshot.json`
- `chat.md`
- `chat.html`

No `assets/` directory was expected or present because the source manifest declared zero assets.

## Hash Proof

Source hashes:

- `manifest.json`: `sha256-0f54eb1516d7e047c21b8cfb2037f45ddc7996f867264f69a7f552ce6c39933d`
- `snapshot.json`: `sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec`
- `chat.md`: `sha256-55539182331c4b877f798501d892652035286fdc7d66b65c89f62d8831a7431d`
- `chat.html`: `sha256-ec6147f562c6a4ee308091c1ad19d067f60867467b1fbaa09c450108066b5e53`

Destination hashes:

- `manifest.json`: `sha256-0f54eb1516d7e047c21b8cfb2037f45ddc7996f867264f69a7f552ce6c39933d`
- `snapshot.json`: `sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec`
- `chat.md`: `sha256-55539182331c4b877f798501d892652035286fdc7d66b65c89f62d8831a7431d`
- `chat.html`: `sha256-ec6147f562c6a4ee308091c1ad19d067f60867467b1fbaa09c450108066b5e53`

Result:

- Destination files match source files for all manifest-declared package files.
- `manifest.files.snapshot.sha256` matches `sha256(snapshot.json bytes)`.
- `manifest.files.markdown.sha256` matches `sha256(chat.md bytes)`.
- `manifest.files.html.sha256` matches `sha256(chat.html bytes)`.
- For this v1 asset-free package, `manifest.contentHash === manifest.files.snapshot.sha256`.
- `manifest.contentHash` matches the expected value: `sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec`.

## No-Mutation Proof

Preflight counts:

- source archive package count: `19`
- `chats`: `41`
- `snapshots`: `29`
- `snapshot_turns`: `72`
- `saved_chat_archive_requests`: `71`

Post-export terminal verification:

- source archive package count: `19`
- `chats`: `41`
- `snapshots`: `29`
- `snapshot_turns`: `72`
- `saved_chat_archive_requests`: `71`

Observed:

- Source package hashes were unchanged.
- Source archive package count was unchanged.
- Desktop DB counts were unchanged.
- Export package contained no sidecar receipt files.
- The exported package was a manifest-driven copy only.

## Capability Decision

The observed `forbidden path` was a real product capability gap for bounded export read-back, not a reason to broaden the export boundary.

The fix is intentionally narrow:

- add `fs:allow-read-file` scoped only to `$HOME/H2O Studio Exports/**`
- keep the fixed export root `$HOME/H2O Studio Exports/`
- keep no `$HOME/**` broad write/read scope
- keep no `$DOWNLOAD/**` broad scope
- keep no sync/WebDAV/cloud/native messaging path
- keep no Chrome package-body authority

After rebuilding/relaunching Desktop, the same runtime read-back verification path **did**
read the exported destination files (`destinationReadbackOk: true`), and a same-name second
export returned `destination-exists` with `noOverwriteConfirmed: true` — the destination
already existed and was not overwritten.

## Boundary Status

Preserved:

- No zip implementation.
- No OS share sheet.
- No cloud/WebDAV/sync propagation.
- No restore/relink.
- No Chrome runtime/service-worker changes.
- No scanner/materializer/writer/importer changes.
- No broad filesystem capability expansion.
- No source package mutation.
- No DB mutation.
- No package overwrite.
- No stash/f17/sync/appearance/ribbon files touched.

## Validation Results

Passed:

- `node tools/validation/studio/validate-saved-chat-archive-export-share-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs`
- `node tools/validation/studio/validate-studio-archive-health-ui.mjs`
- `node -e "JSON.parse(require('fs').readFileSync('apps/studio/desktop/src-tauri/capabilities/archive-export.json','utf8')); console.log('archive-export.json OK')"`
- `git diff --check`
- `git diff --cached --check`

## Resolution (done)

The minimal DevTools confirmation was rerun after rebuilding/relaunching Desktop with the
bounded read-back capability, and all three checks passed:

- destination read-back succeeded under `$HOME/H2O Studio Exports/**` (`destinationReadbackOk: true`)
- same `exportName` returned `destination-exists`
- no overwrite occurred (`noOverwriteConfirmed: true`)

No further follow-up remains for J.3. The export action is verification-gated,
no-overwrite, bounded, and runtime-confirmed.
