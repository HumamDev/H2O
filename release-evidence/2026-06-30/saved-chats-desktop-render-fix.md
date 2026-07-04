# Saved Chats Desktop Render Fix

Status: PATCHED - RUNTIME RELOAD PROOF REQUIRED

## Root Cause

Desktop SQLite contained saved chat data, but the Saved chats route treated `archived` as mutually exclusive with Saved membership.

The live Desktop diagnostic showed LibraryIndex had 41 rows and 28 saved rows, while the DOM rendered 0 rows. The sample saved rows carried:

- `view: "archived"`
- `displayView: "archived"`
- `isSaved: true`
- `state.isSaved: true`
- `isDeleted: false`

The route/core filter paths excluded archived rows before checking saved membership. Because Desktop projection can mark saved archive-delivered rows with archive display state, the Saved page dropped all real saved rows.

## Data Check Summary

Terminal inspection of the live Desktop SQLite store showed saved data exists:

- `chats`: 41
- `saved`: 33
- `deleted`: 0
- `snapshots`: 29
- `snapshot_turns`: 72
- saved rows with `last_snapshot_id`: 28
- saved rows with snapshot rows: 28
- saved rows with turns: 28

Runtime archive packages also exist under the Desktop app data archive store. The repo `archive/packages` directory is not the live Desktop package store.

## Fix Summary

The patch makes Saved membership independent from archive display status:

- Shared Library Index core now treats saved rows as active Saved members even if they also have archived/archive display state.
- `canonicalHeadlineCounts` still increments the archive side bucket for archived rows, but no longer returns early for saved archived rows.
- `canonicalSavedRecentRows` includes saved archive-displayed transcript rows.
- Studio route filtering now drops archived rows only when they are not saved.
- Sidebar Recents no longer excludes saved transcript rows solely because `archived` is true.

Deleted/tombstoned rows remain excluded. Link-only rows remain excluded from Saved unless they carry a saved transcript signal.

## Validator Coverage

Added:

- `tools/validation/studio/validate-saved-chats-desktop-render-v1.mjs`

The validator proves:

- `view:"archived" + isSaved:true` rows appear in Saved view.
- Link-only unsaved rows stay out of Saved.
- Deleted saved rows stay out.
- Archive view still includes archived rows.
- Saved recents include saved archive-displayed rows.
- Shared, runtime, and Studio Library Index core copies remain aligned.
- Studio shell route filtering no longer removes saved rows solely because `archived` is true.

Updated:

- `tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs`

The F19 canonical row expectations now allow saved archived rows to count as Saved/active while preserving the archive side bucket.

## Runtime Proof Snippet

After rebuilding/reloading Desktop Studio, run this in Desktop Studio DevTools Console on `#/saved`:

```js
await H2O.LibraryIndex.refresh?.({ force: true });
const rows = H2O.LibraryIndex.getAll();
const savedRows = rows.filter((row) => {
  const state = row && typeof row.state === "object" ? row.state : {};
  return !row.isDeleted && !row.deleted && !row.tombstoned
    && (row.isSaved === true || row.saved === true || state.isSaved === true);
});
await H2O.Studio?.refresh?.();
await new Promise((resolve) => setTimeout(resolve, 250));
({
  rowCount: rows.length,
  savedRows: savedRows.length,
  domRows: document.querySelectorAll("article.wbHistoryRow").length,
  listTitle: document.querySelector("#listTitle")?.textContent || "",
  listSubtitle: document.querySelector("#listSubtitle")?.textContent || "",
  emptyText: document.querySelector(".wbEmptyState")?.textContent?.trim() || "",
  firstVisibleRows: Array.from(document.querySelectorAll("article.wbHistoryRow"))
    .slice(0, 5)
    .map((article) => ({
      chatId: article.dataset.chatId || "",
      snapshotId: article.dataset.snapshotId || "",
      title: article.querySelector(".wbHistoryTitle, h3, .title")?.textContent?.trim() || article.textContent.trim().slice(0, 120),
    })),
  firstSavedRows: savedRows.slice(0, 5).map((row) => ({
    chatId: row.chatId || row.id || "",
    snapshotId: row.snapshotId || row.lastSnapshotId || "",
    view: row.view || "",
    displayView: row.displayView || "",
    isSaved: row.isSaved === true || row.saved === true || row.state?.isSaved === true,
  })),
});
```

Expected:

- `rowCount` remains 41 or current live count.
- `savedRows` remains 28 or current saved snapshot-backed count.
- `domRows > 0`.
- `listSubtitle` no longer says `0 chats shown`.
- `emptyText` is empty.
- visible rows have `data-chat-id` and saved row titles.

## Validation Results

Passed:

- `node --check src-surfaces-base/studio/S0F0d. 🎬 Library Index Core - Studio.js`
- `node --check src-runtime-base/0F0d.⬛️🧬 Library Index Core 🧬.js`
- `node --check shared/library/library-index-core.js`
- `node --check src-surfaces-base/studio/studio.js`
- `node --check tools/validation/studio/validate-saved-chats-desktop-render-v1.mjs`
- `node --check tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs`
- `node tools/validation/studio/validate-saved-chats-desktop-render-v1.mjs`
- `node tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs`
- `node tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs`

Blocked by unrelated dirty file:

- `node tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs`
  - Fails on `src-surfaces-base/studio/studio.html: missing Studio shell cache bust`.
  - The file was already dirty and is outside this saved-page fix.

## Product Boundaries

- No WebDAV/cloud/archive CAS transport changes.
- `productSyncReady` remains false.
- No `fullBundle.v3` mint.
- No folder/label/tag/category sync behavior changes.
- No archive package materialization/import/export/restore/relink behavior changes.
- Deleted/tombstoned rows remain hidden from Saved.
