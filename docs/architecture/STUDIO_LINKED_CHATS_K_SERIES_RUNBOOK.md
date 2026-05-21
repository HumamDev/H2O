# Studio Linked Chats K-Series Runbook

Status: completed and runtime-proven

## Purpose

Linked Chats are ChatGPT conversation links registered in Studio without a full saved snapshot. They let Studio show a known chat in Library surfaces while keeping the original conversation on `chatgpt.com`.

The current Library tiers are:

- Saved Chats: full Studio snapshots with a `snapshotId`; row click opens the normal Studio reader.
- Linked Chats: linked-only ChatRegistry records with no saved snapshot; row click opens an in-Studio linked details panel and exposes an explicit Open original action.
- Indexed/content-search chats: future tier for searchable captured content or richer indexing; not implemented by this K-series.

This K-series intentionally avoided automatic content capture. Linked Chats are link records, not transcript snapshots.

## Final Architecture

End-to-end path:

```text
Add-to-Library on chatgpt.com
-> native ChatRegistry linked record
-> linked state persists across chatgpt.com reload
-> native 0F1h linkedRecords broadcast
-> dev-controls-oauth-google source extension forwarder
-> Studio Launcher background receiver
-> Studio Launcher chrome.storage.local native broadcast payload
-> Studio S0F1c LibraryIndex refresh/projection
-> #/library/linked
-> #/linked
```

Key behavior:

- Add-to-Library writes a native ChatRegistry record with `state.isLinked: true`, `state.isSaved: false`, `linkedAt`, `linkedFrom`, and URL provenance.
- `0F1g Chat Registry` now waits for `H2O.Library.RegistryCore` before disk adoption, so reload does not drop linked state.
- `0F1h Library Sync` snapshots eligible linked records and includes them in `linkedRecords`.
- The source extension forwards native linked records to Studio Launcher.
- Studio Launcher stores the received native broadcast in its own extension storage namespace.
- Studio `S0F1c LibraryIndex` refreshes on cross-surface broadcasts and projects linked rows.
- `#/library/linked` reads from LibraryIndex through Library Insights.
- Standalone `#/linked` now merges linked LibraryIndex rows into the standalone workbench list pipeline.

## Final Runtime Proof

The completed chain was proved with a real ChatGPT conversation:

- Add-to-Library created a linked ChatRegistry record.
- After debounce flush, both memory and localStorage had `isLinked: true`.
- After `chatgpt.com` reload, both memory and localStorage still had `isLinked: true`.
- `ChatRegistry.listRecords({ includeDeleted: false })` contained the linked target.
- dev-controls source extension broadcast contained `linkedRecords` with the target.
- Studio Launcher broadcast contained `linkedRecords` with the target and the expected source extension id.
- Studio `LibraryIndex` showed `linkedRows >= 1` and the target was present.
- `#/library/linked` showed the linked row.
- `#/linked` showed the linked row and no empty state.
- Clicking a Library linked row no longer navigated Studio directly to ChatGPT.
- Library linked row click opened an in-page details panel with title, URL, linkedAt, linkedFrom, chatId, Open original, and Back to Linked list.
- Open original explicitly opened the ChatGPT URL.
- Saved rows still opened the normal Studio reader.

## Phase Summary

| Phase | Commit | Files Changed | Purpose | Runtime Proof |
| --- | --- | --- | --- | --- |
| K-1 standalone Linked route | `df53ff6254b5ce15b1643ec721279624dd8742a3` | `src-surfaces-base/studio/studio.js` | Added standalone `#/linked` route and linked placeholder/details reader. | Passed after later sourcing fix; placeholder opens in Studio with Open original and Back controls. |
| K-2 visible Linked tab | `215cd5ac092c8ba0be6a4d328e50e19af30a6965` | `src-surfaces-base/studio/S0F1d. 🎬 Library Insights - Studio.js` | Added visible `#/library/linked` tab to Library page. | Passed; Library tab shows linked row from LibraryIndex. |
| K-2.5 LibraryIndex refresh listener | `e9032015cdd33d9de5d85c658511bd131c93d077` | `src-surfaces-base/studio/S0F1c. 🎬 Library Index - Studio.js` | Refreshed Studio LibraryIndex on cross-surface sync broadcasts. | Passed; LibraryIndex updates after native broadcast. |
| K-2.6 cross-extension bridge | `0d05505520564b47bf3cdf367e552f4ae2af193f` | `tools/product/extensions/chatgpt/chrome/chrome-live-background.mjs`, `tools/product/extensions/chatgpt/chrome/chrome-live-loader.mjs` | Forwarded native linked records from active source extension to Studio Launcher. | Passed; Studio Launcher received `linkedRecords` from `ogcjkeaiicglflamhjaaimdhphjlgkbb`. |
| K-2.7 runtime diagnosis | No code commit | None | Proved `0F1h snapshotLinkedRecords()` worked when a record was actually linked. | Passed; source broadcast contained linked target after repeat Add-to-Library. |
| K-2.8 linked-state durability | `7c7e4ceabe2267b4578562d529251f24227f9b9c` | `src-runtime-base/0F1g.⬛️🗂️ Chat Registry 🧾🗂️.js` | Fixed boot/adoption ordering so linked records survive reload. | Passed; memory, disk, list API, and broadcasts retained linked state after reload. |
| K-2.9 standalone route sourcing | `36488e628721f9ff57f72a22a82aaae0a487dbbc` | `src-surfaces-base/studio/studio.js` | Added linked LibraryIndex rows to standalone `#/linked` workbench pipeline in MV3 Studio Launcher. | Passed; standalone `#/linked` showed `.wbHistoryRow--linked >= 1`. |
| K-3 unified linked click behavior | `68cc2dc74b48d61d7ccb3fe6eaad82dba3885e6f` | `src-surfaces-base/studio/S0F1d. 🎬 Library Insights - Studio.js` | Replaced direct Library linked-row external navigation with in-page linked details panel. | Passed; Library row opens panel, Open original works explicitly, saved rows still open reader. |

## Important Bugs Found And Fixed

- Standalone `#/linked` source mismatch in MV3: Studio Launcher is not Tauri, so `fetchWorkbenchRows()` fell back to archive bridge rows only. Linked-only rows with no `snapshotId` never entered the standalone list. K-2.9 merged linked LibraryIndex rows into the standalone pipeline.
- Cross-extension storage namespace mismatch: source extension storage and Studio Launcher storage are isolated. K-2.6 added the native linked-record forwarder and Studio Launcher receiver path so the target extension receives and stores the native broadcast payload in its own namespace.
- Source-side linked state durability bug: `0F1g Chat Registry` could boot before `RegistryCore`, treat non-empty disk as empty, and let passive boot/index/recents writes flush an unlinked replacement. K-2.8 made disk adoption wait for `RegistryCore` and guarded against failed empty adoption overwriting non-empty disk state.
- Library tab row-click behavior mismatch: `#/library/linked` opened the original ChatGPT URL directly while standalone `#/linked` stayed in Studio. K-3 changed Library linked rows to open an in-page details panel with explicit Open original.

## Safety Boundaries Preserved

The Linked Chats K-series preserved these boundaries:

- No SQLite schema change.
- No content indexing.
- No automatic chat capture.
- No bidirectional sync.
- No Chrome write to sync folder.
- No folder sync behavior change.
- No import/export bundle behavior change.
- No Mobile/WebDAV changes.
- No Rust/Tauri/Cargo/capability changes in the Linked Chats K-series; unrelated earlier file-picker work remains separate.
- No change to Saved Chat reader behavior.
- Linked records remain idempotent by chat id / URL provenance and remain distinct from saved snapshots.

## Remaining Deferred Work

- Optional polish around Save to Folder button visibility and capability reporting in linked details panels.
- Optional comment cleanup from "prod Cockpit Pro" wording to "active source extension" wording where the source extension can vary.
- Future Indexed/content-search tier remains out of scope.
- Optional cleanup of unrelated dirty working-tree files observed during the K-series.
- Automatic watchers and bidirectional sync remain deferred and out of scope.

## Working-Tree Warning

Unrelated dirty files were observed during this chain and must remain separate from Linked Chats commits. In particular, F2/dock/export/markdown/ribbon, overlay, storage-contract, and file-picker-related changes should not be staged into Linked Chats follow-up commits unless a future phase explicitly scopes them in.

Before any future Linked Chats work:

```bash
git status --short
git diff --name-only
git diff --cached --name-only
```

Only stage files that belong to the active phase.
