# Studio Folder-State Manual Bridge — Runbook

> **Status**: Validated 2026-05-21. This documents a **manual, one-way,
> user-mediated** bridge from Chrome/Studio folder-state to Desktop Studio
> persistence. It is **not** bidirectional sync, **not** a daemon, **not**
> automatic, and **not** something Chrome writes from code. The user
> captures a JSON file by hand and Desktop imports it on demand.
>
> Related ADRs / docs:
> [Library Migration Plan](./library-migration-plan.md),
> [Storage Map](./storage-map.md),
> [Lifecycle Map](./lifecycle-map.md).

---

## 1. Purpose

Provide a **reproducible, low-blast-radius** way to project the live
Chrome/ChatGPT folder catalog (folder ids + names + visual metadata + the
folder→chat binding map) into the Desktop Studio SQLite store so the same
six folders ("Study", "Case", "Dev", "Code", "Tech", "English" in the
validated capture) appear in Desktop's Library views and in
`exportFullBundle()` output.

What this bridge **is**:

- A manual handoff: the user captures Chrome state into a JSON file, then
  invokes a Desktop import call.
- One-way only: Chrome → file → Desktop.
- Folder-only: `folders` + `items` (folder→chat bindings). No chats, no
  snapshots, no labels, no categories.
- Non-deleting and ID-primary: imports merge into existing folders by
  `id`. Same-name/different-id folders are preserved.

What this bridge **is not**:

- Not bidirectional. Desktop never pushes folder state back to Chrome
  through any code path.
- Not a daemon. There is no background watcher, no filesystem listener,
  no scheduled job.
- Not automatic. Nothing runs unless the user manually executes the
  capture and import steps below.
- Not a schema migration. The Desktop SQLite schema is unchanged.
- Not a Chrome write path. Chrome does **not** write to the sync folder
  from code. Capture is read-only from page-world `localStorage`.

---

## 2. Validated commits

The bridge relies on three commits that landed on `main` ahead of this
runbook. The runtime proof in section 3 was executed against exactly
this commit chain (linear, no merge commits between them).

| Order | Commit | Subject |
|---|---|---|
| 1 | `24871576b954f654ddcebceda00c332a11a6e15c` | Add Desktop folder-state export fallback |
| 2 | `f517a3a1847f489f2a4dcb8b227375de5a5fe8ae` | Add folder-only Desktop import entry point |
| 3 | `e4c87231ea1a54aabc26fe5a0fb626c550b2ca24` | Route folder-only sync through Desktop folder import |

Short hashes used in the working tree: `2487157`, `f517a3a`, `e4c8723`.

What each commit added (high-level, no implementation detail):

- **`2487157`** — Desktop `exportFullBundle()` now emits the
  folder-state KV (`h2o:prm:cgx:fldrs:state:data:v1`) even when the
  in-process facade has no fresh copy, by reading directly from the
  `kv_store` table.
- **`f517a3a`** — Adds the public API
  `H2O.Studio.ingestion.importFolderStateOnly(payload, options?)` plus
  the internal `normalizeFolderStatePayload` helper. Reuses the existing
  `importFolders` and `importFolderBindings` private helpers in
  `studio/ingestion/import-bundle.tauri.js`. No schema change.
- **`e4c8723`** — `H2O.Studio.sync.importFromFile(...)` now detects a
  folder-only payload via `isFolderOnlyPayload(bundle)` and dispatches
  it through the folder-only entry point. Adds `routedVia` to the
  result and `folderOnlyApiAvailable` to `diagnose()`.

---

## 3. Validated runtime proof (2026-05-21)

The procedure in section 4 was executed end-to-end against the real
Chrome/Studio folder catalog. Recording the observed outputs here so the
runbook is verifiable, not theoretical.

### Capture

- Source key: `h2o:prm:cgx:fldrs:state:data:v1` (constant
  `FOLDER_STATE_DATA_KEY` in
  `tools/product/extensions/chatgpt/chrome/chrome-live-background.mjs`).
- Source surface: `chatgpt.com` page-world
  `window.localStorage['h2o:prm:cgx:fldrs:state:data:v1']` (the
  background-mirrored copy was equivalent; either source is acceptable
  for capture).
- Output path: `/Users/hobayda/H2O Studio Sync/real-folder-state.json`
  (≈ 2 KB JSON).
- Output wrapper:
  - `schemaVersion: 1`
  - `exportedFrom: "chrome-folder-state-manual-proof"`
  - `exportedAt: "2026-05-21T01:09:08.319Z"`
  - `folders: [...]` (6 entries)
  - `items: { <folderId>: [<chatRef>, ...] }` (7 bindings across 4
    populated folders, 2 empty folders preserved)

### Import + result

- Call: `await H2O.Studio.sync.importFromFile('/Users/hobayda/H2O Studio Sync/real-folder-state.json')`
- `routedVia: importFolderStateOnly`
- `ok: true`
- `fallbackKvUpdated: true`
- `written.folders: 6`
- Post-import `exportFullBundle()` summary:
  - `exportedFolderCount: 12` (6 imported + 6 pre-existing Desktop
    folders; not duplicates of the imported six)
  - `exportedBindingCount: 7`

All six expected folders are visible in both `store.folders.list()` and
`ingestion.exportFullBundle()`: **Study**, **Case**, **Dev**, **Code**,
**Tech**, **English**.

7 orphan-folder-binding warnings were surfaced during import. These are
**expected** — the captured chat refs originated in Chrome and have no
counterpart in the Desktop `chats` table yet. Bindings are still
persisted; they remain orphaned until the corresponding chats are
imported through a separate (chat-ingestion) phase. The bridge does not
delete or skip orphaned bindings; it warns and continues.

---

## 4. Step-by-step procedure

### 4.1 Capture Chrome/Studio folder-state

The folder-state lives in two equivalent places:

- `chatgpt.com` page-world `window.localStorage['h2o:prm:cgx:fldrs:state:data:v1']`
- MV3 background `chrome.storage.local` under the same key
  (`FOLDER_STATE_DATA_KEY`, written by `flushFolderState` in
  `chrome-live-background.mjs`).

For the manual proof, read from page-world `localStorage` — it is
accessible without DevTools privileges and matches the background copy
in normal operation.

Open `chatgpt.com` in Chrome, open DevTools → Console, paste:

```js
(() => {
  const raw = window.localStorage.getItem('h2o:prm:cgx:fldrs:state:data:v1');
  if (!raw) { console.warn('NO FOLDER STATE FOUND'); return; }
  const parsed = JSON.parse(raw);
  console.log('FOLDER COUNT:', parsed.folders?.length || 0);
  console.log('FOLDER NAMES:', (parsed.folders || []).map(f => f.name));
  console.log('BINDING COUNT:',
    Object.values(parsed.items || {}).reduce((n, arr) => n + arr.length, 0));
  // Stash for slicing if console output is truncated:
  window.__H2O_FOLDER_STATE_RAW__ = raw;
})();
```

### 4.2 Build the folder-only JSON file

Wrap the captured payload with a small attribution envelope so it is
traceable in Desktop's import ledger:

```json
{
  "schemaVersion": 1,
  "exportedFrom": "chrome-folder-state-manual-proof",
  "exportedAt": "<ISO-8601 timestamp>",
  "folders": [ /* exactly as captured */ ],
  "items":   { /* exactly as captured */ }
}
```

Do **not** invent folders or bindings. Do **not** drop empty folders
(`items[id]: []` is meaningful; it tells the import not to expect
bindings for that folder, but still to persist the folder row).

### 4.3 Save the file

Path convention:

```
~/H2O Studio Sync/real-folder-state.json
```

Pick this path because Desktop's `importFromFile(...)` accepts an
absolute path and `~/H2O Studio Sync/` is a stable, user-private
location outside the repo working tree. Nothing in the runbook depends
on the directory name — any path the user can read from Desktop works.

### 4.4 Import in Desktop Studio

Open Desktop Studio. Open DevTools (right-click → Inspect) on the Tauri
WebView. In the Console:

```js
(async () => {
  const r = await H2O.Studio.sync.importFromFile(
    '/Users/hobayda/H2O Studio Sync/real-folder-state.json'
  );
  console.log('IMPORT RESULT:', JSON.stringify({
    routedVia: r.routedVia,
    ok: r.ok,
    written: r.result?.written,
    fallbackKvUpdated: r.result?.fallbackKvUpdated,
    errors: r.result?.errors || null
  }, null, 2));
})();
```

Expected: `routedVia: "importFolderStateOnly"`, `ok: true`,
`written.folders >= <imported folder count>`, no errors.

If `routedVia` reports a different value, the payload was not detected
as folder-only (likely because extra non-folder keys were included in
the wrapper). Strip everything except `schemaVersion`, `exportedFrom`,
`exportedAt`, `folders`, `items`.

### 4.5 Verify Desktop store

```js
(async () => {
  const folders = await H2O.Studio.store.folders.list();
  console.log('FOLDER COUNT:', folders.length);
  for (const f of folders) {
    const bindings = await H2O.Studio.store.folders.listBindings(f.id);
    console.log('  -', f.name,
      '(' + f.id.slice(0, 16) + '…)',
      'iconColor=' + (f.iconColor || 'none'),
      'bindings=' + bindings.length);
  }
})();
```

Expected: every folder from the captured JSON appears with a matching
`bindings` count.

### 4.6 Verify Desktop export

```js
(async () => {
  const bundle = await H2O.Studio.ingestion.exportFullBundle();
  console.log('EXPORT SUMMARY:', JSON.stringify({
    schemaVersion: bundle.schemaVersion,
    folderCount: bundle.folders?.length || 0,
    folderNames: (bundle.folders || []).map(f => f.name),
    folderBindingCount: bundle.folderBindings?.length || 0
  }, null, 2));
})();
```

Expected: `folderCount` ≥ imported count, `folderNames` includes every
captured name, `folderBindingCount` equals the captured binding count.

### 4.7 (Optional) Diagnose

```js
console.log(await H2O.Studio.sync.diagnose());
```

Look for `folderOnlyApiAvailable: true`. If `false`, the loaded Desktop
bundle predates `f517a3a` — rebuild via `npm run prepare-dist` and
relaunch Studio.

---

## 5. Safety envelope

The bridge is intentionally narrow. The following properties are
guaranteed by the import path and must remain guaranteed:

- **One-way.** Chrome never writes to the sync folder from code.
  Desktop never writes back to Chrome storage. The only writer to
  `~/H2O Studio Sync/` is the human running the capture procedure.
- **No daemon.** Nothing polls the sync folder. The Desktop import
  runs once, on the call to `importFromFile(...)`.
- **No schema change.** The folder-only import uses the existing
  `folders` and `folder_bindings` tables.
- **No deletion.** The import path is INSERT-or-UPDATE. Folders that
  exist in Desktop but not in the JSON are left untouched. Bindings
  not present in the JSON are not removed.
- **ID-primary merge.** Folders are matched on `id`, not name.
  Two folders with the same name but different ids are preserved as
  two separate rows. Renames in Chrome (same id, different name)
  update the Desktop row.
- **Orphan bindings warn, do not error.** If a binding references a
  chat that does not exist in Desktop's `chats` table, the binding
  is still written and a warning is recorded in `result.warnings`.
  The import completes successfully.
- **Bundle envelope unchanged.** The folder-only payload is a strict
  subset of `h2o.studio.fullBundle.v2`. Nothing in this bridge
  introduces a new wire format.

If a future change weakens any of these properties, that change is out
of scope for this runbook and must be documented separately.

---

## 6. Known limitations

These are deliberate accepted-as-is gaps. They are not bugs.

- **Orphaned bindings.** Bindings whose `chatId` is not present in the
  Desktop `chats` table are persisted but flagged. They become live
  once the corresponding chats are ingested through the chat-ingestion
  phase (separate, not yet landed).
- **Duplicate folder names.** Same-name/different-id folders are
  preserved as distinct rows by design. The Library UI displays both.
  Cleanup is manual.
- **Test folders persist.** Any test or scratch folder created during
  development remains in the Desktop store until manually removed.
  The bridge does not delete.
- **Manual JSON handoff is the only trigger.** There is no UI button,
  no menu action, no file watcher. The runbook step is the
  user-mediated trigger.
- **No conflict detection beyond ID-primary merge.** If Chrome and
  Desktop independently rename a folder with the same id between
  captures, the most recent import wins.
- **Visual metadata fidelity.** `iconColor` is preserved when present
  in the capture. Folders without `iconColor` in Chrome stay
  uncoloured in Desktop. The bridge does not assign defaults.

---

## 7. Future phase options (not landed)

Each item below is **optional and deferred**. None is in scope for this
runbook. They are listed only so a future contributor knows what was
considered and consciously left out.

- **Orphan-binding visibility in `diagnose()`** — surface
  `lastImportOrphanBindings: <count>` and an optional `peek` of the
  unmatched chat refs. Single-file edit in
  `studio/sync/folder-sync.tauri.js`. No schema change. No new
  behavior — just exposing what the import path already records.
- **Manual UI import action** — a Studio Settings → Library →
  "Import folder-state from file…" button that wraps the same
  `importFromFile(...)` call with a native file picker. UI-only.
- **Cleanup tools for test folders** — a maintenance surface that
  lists folders + binding counts and lets the user select rows to
  delete. Net new behavior; requires explicit user action per row;
  no automatic cleanup.
- **Inverse manual proof (Desktop → file)** — using the existing
  `exportFullBundle()` to produce a file at `~/H2O Studio Sync/
  desktop-export-<timestamp>.json` and inspecting it. Read-only on
  the Desktop side; still no Chrome write-back.
- **Automatic watcher import** — a Desktop-side filesystem watcher
  on `~/H2O Studio Sync/` that re-imports on file change. **Remains
  deferred** because it changes the trust model (auto-import implies
  trusting the file producer) and crosses the manual-only boundary
  that this runbook codifies.

These are listed in roughly increasing order of blast radius. The
first two are safe single-file changes; the last two materially change
the bridge's semantics and should not be combined with anything else
in a single phase.

---

## 8. Failure modes and recovery

| Symptom | Likely cause | Recovery |
|---|---|---|
| `routedVia` is not `importFolderStateOnly` | Payload wrapper has extra non-folder keys | Strip to `schemaVersion`, `exportedFrom`, `exportedAt`, `folders`, `items` |
| `ok: false`, errors mention `importFolderStateOnly is not a function` | Desktop bundle predates `f517a3a` | Rebuild via `npm run prepare-dist`, relaunch Studio |
| `written.folders: 0` but `fallbackKvUpdated: true` | Folder-only API not available; routing fell back to KV write only | Same as above — rebuild dist |
| Folder count after import is unexpectedly high | Pre-existing Desktop folders unrelated to the import; not duplicates of imported folders | Confirm by paste-block listing all folder names; no action required if names don't overlap |
| Many orphan-binding warnings | Captured chats not yet in Desktop `chats` table | Expected — wait for chat-ingestion phase |
| `H2O.Studio.sync` is undefined in DevTools | Studio runtime not booted, or wrong window context | Wait for boot (≈ 600ms post-launch — see `feedback_tauri_webview_boot_race`), then retry |

---

## 9. Out of scope

This runbook is **only** about the manual folder-state bridge. The
following are deliberately not addressed here and must not be folded
into this document:

- Mobile / WebDAV ingestion paths
- Chrome import logic
- Desktop SQLite schema evolution
- UI redesign
- Bidirectional sync architecture
- Daemon sync architecture
- Chat-level ingestion (chats, snapshots, snapshot_turns)
- Label / category / tag ingestion

Any change touching the above should land in its own commit and its
own doc.
