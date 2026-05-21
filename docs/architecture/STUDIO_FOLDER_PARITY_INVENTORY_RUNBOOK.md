# Studio Folder Parity Inventory Runbook

Phase: Folders-P1

Status: diagnostics only

## Purpose

This runbook captures folder catalog and folder membership inventory across:

1. Native ChatGPT extension folder state
2. Chrome Studio / Studio Launcher Library
3. Desktop Studio app

Folders-P1 is read-only. It does not clean, delete, merge, repair, normalize, or write folder data. The output is an inventory report that later phases can use to design reviewed reconciliation.

Same-name folders with different IDs are intentionally treated as conflicts, not duplicates to auto-merge. Folder ID is the binding key for chat membership. Merging by name alone can move chats to the wrong folder, erase visual metadata, or hide distinct folders the user intentionally created.

## Canonical Target

Native ChatGPT folder state is the likely canonical source for user-facing folder names and native membership counts unless runtime probes disprove it.

Expected real folders from the current native screenshot:

| Folder | Native count |
| --- | ---: |
| Study | 4 |
| Case | 0 |
| Dev | 0 |
| Code | 1 |
| Tech | 2 |
| English | 1 |

Expected canonical catalog size: 6 folders.

## Known Candidates

Known test-folder candidates:

- `Case-RT`
- `Empty Test Folder`
- `Empty-RT`
- `English-RT`
- `F5D Test Folder`

Known same-name conflict candidates:

- duplicate `Case`
- duplicate `English`

These names are candidates only. A later cleanup phase must inspect folder IDs, native presence, binding counts, metadata, and provenance before any destructive action.

## Standard Output Schema

Each probe should return one JSON-like object with this shape:

```js
{
  surface: "native-chatgpt | chrome-studio | desktop-studio",
  folderCount: 0,
  bindingCount: 0,
  rows: [
    {
      folderId: "",
      id: "",
      name: "",
      normalizedName: "",
      color: "",
      icon: "",
      iconColor: "",
      source: "",
      bindingCount: 0,
      chatIds: [],
      hrefs: [],
      nativePresent: null
    }
  ],
  duplicateGroups: [
    { normalizedName: "", rows: [] }
  ],
  testFolderCandidates: [],
  orphanBindings: [],
  warnings: [],
  errors: []
}
```

## Probe A: Native ChatGPT

Run this in the ChatGPT page main-world DevTools context where `window.H2O` is visible.

```js
window.__folderParityNativeProbe = (() => {
  const KEY = "h2o:prm:cgx:fldrs:state:data:v1";
  const TEST_NAMES = new Set([
    "case-rt",
    "empty test folder",
    "empty-rt",
    "english-rt",
    "f5d test folder",
  ]);
  const norm = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const chatIdFrom = value => {
    const raw = String(value || "").trim();
    const match = raw.match(/\/c\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : raw;
  };
  const asArray = value => Array.isArray(value) ? value : [];
  const warnings = [];
  const errors = [];

  let parsed = null;
  let raw = "";
  try {
    raw = localStorage.getItem(KEY) || "";
    parsed = raw ? JSON.parse(raw) : {};
  } catch (error) {
    errors.push({ kind: "parse", key: KEY, error: String(error && (error.message || error)) });
    parsed = {};
  }

  const folders = asArray(parsed && parsed.folders);
  const items = parsed && parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)
    ? parsed.items
    : {};
  const folderIds = new Set(folders.map(folder => String(folder && (folder.id || folder.folderId) || "").trim()).filter(Boolean));
  const rows = folders.map((folder, index) => {
    const folderId = String(folder && (folder.id || folder.folderId) || "").trim();
    const name = String(folder && (folder.name || folder.title || folderId) || "").trim();
    const hrefs = asArray(items[folderId]).map(value => String(value || "").trim()).filter(Boolean);
    return {
      index,
      folderId,
      id: folderId,
      name,
      normalizedName: norm(name),
      color: String(folder && (folder.color || folder.iconColor) || "").trim(),
      icon: String(folder && folder.icon || "").trim(),
      iconColor: String(folder && (folder.iconColor || folder.color) || "").trim(),
      source: String(folder && folder.source || "native-folder-state").trim(),
      bindingCount: hrefs.length,
      chatIds: hrefs.map(chatIdFrom).filter(Boolean),
      hrefs,
      nativePresent: true,
      raw: folder
    };
  });

  const orphanBindings = Object.keys(items)
    .filter(folderId => !folderIds.has(folderId))
    .map(folderId => ({
      folderId,
      bindingCount: asArray(items[folderId]).length,
      hrefs: asArray(items[folderId]).map(value => String(value || "").trim()).filter(Boolean),
    }));

  const groups = new Map();
  rows.forEach(row => {
    const key = row.normalizedName;
    if (!key) return;
    const arr = groups.get(key) || [];
    arr.push(row);
    groups.set(key, arr);
  });

  return {
    surface: "native-chatgpt",
    key: KEY,
    rawBytes: raw.length,
    folderCount: rows.length,
    bindingCount: rows.reduce((sum, row) => sum + row.bindingCount, 0),
    rows,
    duplicateGroups: Array.from(groups.entries())
      .filter(([, group]) => group.length > 1)
      .map(([normalizedName, group]) => ({ normalizedName, rows: group })),
    testFolderCandidates: rows.filter(row => TEST_NAMES.has(row.normalizedName)),
    orphanBindings,
    h2oFolderApi: {
      listAvailable: typeof H2O?.folders?.list === "function",
      diagnose: H2O?.folders?.diagnose?.() || null
    },
    warnings,
    errors
  };
})();
window.__folderParityNativeProbe;
```

## Probe B: Chrome Studio / Studio Launcher

Run this in the Studio Launcher page:

`chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html`

```js
window.__folderParityChromeStudioProbe = await (async () => {
  const KEY = "h2o:prm:cgx:fldrs:state:data:v1";
  const TEST_NAMES = new Set([
    "case-rt",
    "empty test folder",
    "empty-rt",
    "english-rt",
    "f5d test folder",
  ]);
  const norm = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const chatIdFrom = value => {
    const raw = String(value || "").trim();
    const match = raw.match(/\/c\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : raw;
  };
  const asArray = value => Array.isArray(value) ? value : [];
  const chromeGet = key => new Promise(resolve => {
    try {
      chrome.storage.local.get(key, value => resolve(value && value[key]));
    } catch (error) {
      resolve({ __error: String(error && (error.message || error)) });
    }
  });
  const chromeGetAll = () => new Promise(resolve => {
    try {
      chrome.storage.local.get(null, value => resolve(value || {}));
    } catch {
      resolve({});
    }
  });

  const warnings = [];
  const errors = [];
  const H = window.H2O || window.W?.H2O || {};
  const stored = await chromeGet(KEY);
  const allStorage = await chromeGetAll();
  const storedFolders = asArray(stored && stored.folders);
  const storedItems = stored && stored.items && typeof stored.items === "object" && !Array.isArray(stored.items)
    ? stored.items
    : {};

  let workspaceFolders = [];
  try {
    const value = await H.LibraryWorkspace?.getFolders?.({ fresh: true });
    workspaceFolders = asArray(value);
  } catch (error) {
    errors.push({ kind: "workspace.getFolders", error: String(error && (error.message || error)) });
  }

  const idx = H.LibraryIndex || null;
  const indexRows = asArray(typeof idx?.getAll === "function" ? idx.getAll() : []);
  const facets = typeof idx?.facets === "function" ? idx.facets() : {};
  const counts = typeof idx?.counts === "function" ? idx.counts() : null;
  const byFolder = facets && facets.byFolder && typeof facets.byFolder === "object" ? facets.byFolder : {};

  const sourceRows = workspaceFolders.length ? workspaceFolders : storedFolders;
  const rows = sourceRows.map((folder, index) => {
    const folderId = String(folder && (folder.id || folder.folderId) || "").trim();
    const name = String(folder && (folder.name || folder.folderName || folder.title || folderId) || "").trim();
    const hrefs = asArray(storedItems[folderId]).map(value => String(value || "").trim()).filter(Boolean);
    const indexedChatIds = asArray(byFolder[folderId]).map(value => String(value || "").trim()).filter(Boolean);
    return {
      index,
      folderId,
      id: folderId,
      name,
      normalizedName: norm(name),
      color: String(folder && (folder.color || folder.iconColor) || "").trim(),
      icon: String(folder && folder.icon || "").trim(),
      iconColor: String(folder && (folder.iconColor || folder.color) || "").trim(),
      source: String(folder && folder.source || (workspaceFolders.length ? "LibraryWorkspace.getFolders" : "chrome.storage.local")).trim(),
      bindingCount: hrefs.length,
      indexedCount: indexedChatIds.length,
      chatIds: hrefs.map(chatIdFrom).filter(Boolean),
      hrefs,
      indexedChatIds,
      nativePresent: null,
      raw: folder
    };
  }).filter(row => row.folderId);

  const groups = new Map();
  rows.forEach(row => {
    const key = row.normalizedName;
    if (!key) return;
    const arr = groups.get(key) || [];
    arr.push(row);
    groups.set(key, arr);
  });

  const sidebarRows = Array.from(document.querySelectorAll(".wbSidebarSectionItem--folders,.wbFolderItem,[data-folder-id]"))
    .map(node => ({
      text: String(node.textContent || "").replace(/\s+/g, " ").trim(),
      folderId: String(node.dataset?.folderId || node.dataset?.id || "").trim(),
      href: node.getAttribute("href") || ""
    }))
    .filter(row => row.text || row.folderId || row.href);

  return {
    surface: "chrome-studio",
    key: KEY,
    storageKeys: Object.keys(allStorage).filter(key => /folder|fldrs/i.test(key)).sort(),
    folderCount: rows.length,
    bindingCount: rows.reduce((sum, row) => sum + row.bindingCount, 0),
    rows,
    duplicateGroups: Array.from(groups.entries())
      .filter(([, group]) => group.length > 1)
      .map(([normalizedName, group]) => ({ normalizedName, rows: group })),
    testFolderCandidates: rows.filter(row => TEST_NAMES.has(row.normalizedName)),
    orphanBindings: Object.keys(storedItems)
      .filter(folderId => !rows.some(row => row.folderId === folderId))
      .map(folderId => ({
        folderId,
        bindingCount: asArray(storedItems[folderId]).length,
        hrefs: asArray(storedItems[folderId]).map(value => String(value || "").trim()).filter(Boolean)
      })),
    index: {
      totalRows: indexRows.length,
      counts,
      folderFacetKeys: Object.keys(byFolder),
      byFolder
    },
    sidebarRows,
    syncDiag: H.Library?.Sync?.diagnose?.() || null,
    workspaceDiag: H.LibraryWorkspace?.diagnose?.() || null,
    warnings,
    errors
  };
})();
window.__folderParityChromeStudioProbe;
```

## Probe C: Desktop Studio

Run this in the Desktop Studio DevTools console.

```js
window.__folderParityDesktopProbe = await (async () => {
  const KEY = "h2o:prm:cgx:fldrs:state:data:v1";
  const TEST_NAMES = new Set([
    "case-rt",
    "empty test folder",
    "empty-rt",
    "english-rt",
    "f5d test folder",
  ]);
  const norm = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const asArray = value => Array.isArray(value) ? value : [];
  const chatIdFrom = value => {
    const raw = String(value || "").trim();
    const match = raw.match(/\/c\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : raw;
  };
  const warnings = [];
  const errors = [];
  const H = window.H2O || window.W?.H2O || {};
  const store = H.Studio?.store?.folders || null;

  let folders = [];
  try {
    if (typeof store?.list === "function") folders = asArray(await store.list());
    else if (typeof store?.getAll === "function") folders = asArray(await store.getAll());
    else warnings.push({ kind: "store.folders", warning: "no list/getAll method" });
  } catch (error) {
    errors.push({ kind: "store.folders.list", error: String(error && (error.message || error)) });
  }

  let fallback = null;
  let fallbackRaw = "";
  try {
    fallbackRaw = localStorage.getItem(KEY) || "";
    fallback = fallbackRaw ? JSON.parse(fallbackRaw) : null;
  } catch (error) {
    warnings.push({ kind: "fallback-key", warning: String(error && (error.message || error)) });
  }
  const fallbackItems = fallback && fallback.items && typeof fallback.items === "object" && !Array.isArray(fallback.items)
    ? fallback.items
    : {};

  const rows = [];
  for (let index = 0; index < folders.length; index += 1) {
    const folder = folders[index];
    const folderId = String(folder && (folder.folderId || folder.id) || "").trim();
    const name = String(folder && (folder.name || folder.title || folderId) || "").trim();
    let chats = [];
    try {
      if (folderId && typeof store?.listChats === "function") chats = asArray(await store.listChats(folderId));
    } catch (error) {
      errors.push({ kind: "store.folders.listChats", folderId, error: String(error && (error.message || error)) });
    }
    const fallbackHrefs = asArray(fallbackItems[folderId]).map(value => String(value || "").trim()).filter(Boolean);
    rows.push({
      index,
      folderId,
      id: folderId,
      name,
      normalizedName: norm(name),
      color: String(folder && (folder.color || folder.iconColor || folder.meta?.color || folder.meta?.iconColor) || "").trim(),
      icon: String(folder && (folder.icon || folder.meta?.icon || folder.meta?.iconKey) || "").trim(),
      iconColor: String(folder && (folder.iconColor || folder.color || folder.meta?.iconColor || folder.meta?.color) || "").trim(),
      source: String(folder && (folder.source || folder.meta?.source || "desktop-sqlite") || "").trim(),
      bindingCount: chats.length,
      fallbackBindingCount: fallbackHrefs.length,
      chatIds: chats.map(chat => String(chat && (chat.chatId || chat.id) || "").trim()).filter(Boolean),
      hrefs: fallbackHrefs,
      fallbackChatIds: fallbackHrefs.map(chatIdFrom).filter(Boolean),
      nativePresent: null,
      raw: folder
    });
  }

  const groups = new Map();
  rows.forEach(row => {
    const key = row.normalizedName;
    if (!key) return;
    const arr = groups.get(key) || [];
    arr.push(row);
    groups.set(key, arr);
  });

  const sidebarRows = Array.from(document.querySelectorAll(".wbFolderItem,.wbSidebarSectionItem--folders,[data-folder-id]"))
    .map(node => ({
      text: String(node.textContent || "").replace(/\s+/g, " ").trim(),
      folderId: String(node.dataset?.folderId || node.dataset?.id || "").trim(),
      href: node.getAttribute("href") || ""
    }))
    .filter(row => row.text || row.folderId || row.href);

  return {
    surface: "desktop-studio",
    key: KEY,
    folderCount: rows.length,
    bindingCount: rows.reduce((sum, row) => sum + row.bindingCount, 0),
    fallbackFolderCount: asArray(fallback && fallback.folders).length,
    fallbackBindingCount: Object.values(fallbackItems).reduce((sum, value) => sum + asArray(value).length, 0),
    rows,
    duplicateGroups: Array.from(groups.entries())
      .filter(([, group]) => group.length > 1)
      .map(([normalizedName, group]) => ({ normalizedName, rows: group })),
    testFolderCandidates: rows.filter(row => TEST_NAMES.has(row.normalizedName)),
    orphanBindings: Object.keys(fallbackItems)
      .filter(folderId => !rows.some(row => row.folderId === folderId))
      .map(folderId => ({
        folderId,
        bindingCount: asArray(fallbackItems[folderId]).length,
        hrefs: asArray(fallbackItems[folderId]).map(value => String(value || "").trim()).filter(Boolean)
      })),
    sidebarRows,
    storeDiag: store?.diagnose?.() || null,
    exportDiag: H.Studio?.ingestion?.diagnoseExportBundle?.() || H.Studio?.ingestion?.diagnose?.() || null,
    warnings,
    errors
  };
})();
window.__folderParityDesktopProbe;
```

## Classification Rules

Use these rules when reviewing the three probe outputs.

| Classification | Rule | Action in P1 |
| --- | --- | --- |
| Preserve | Folder name and ID are present in native canonical rows, or clearly match one of the six expected real folders with the native ID. | Inventory only |
| Review duplicate | Same normalized name appears with multiple folder IDs on any surface. | Do not merge |
| Review test candidate | Name matches known test-folder candidate. | Check native presence and bindings |
| Safe-test candidate | Test name, native-absent, zero bindings on all surfaces, no visual metadata worth preserving. | Mark for later approval only |
| Orphan binding | Binding references a folder ID absent from that surface catalog. | Review before repair |
| Missing from mirror | Native folder ID absent from Chrome or Desktop. | Plan non-destructive mirror add |
| Extra local-only | Chrome or Desktop folder ID absent from native. | Review provenance and bindings |
| Count mismatch | Native binding count differs from Studio indexed/saved count. | Usually expected until membership mirror counts are separated from known-chat counts |

Same-name/different-ID is always a conflict in P1. It is not an auto-merge condition.

## Comparison Template

Paste probe summaries into this table for P2.

| Normalized name | Native row | Chrome Studio row | Desktop row | Bindings summary | Recommended status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `study` | id / count / metadata | id / count / metadata | id / count / metadata | native vs chrome vs desktop | preserve / missing from mirror / conflict | |
| `case` | id / count / metadata | ids / counts / metadata | ids / counts / metadata | native vs chrome vs desktop | review duplicate | |
| `dev` | id / count / metadata | id / count / metadata | id / count / metadata | native vs chrome vs desktop | preserve | |
| `code` | id / count / metadata | id / count / metadata | id / count / metadata | native vs chrome vs desktop | preserve | |
| `tech` | id / count / metadata | id / count / metadata | id / count / metadata | native vs chrome vs desktop | preserve | |
| `english` | id / count / metadata | ids / counts / metadata | ids / counts / metadata | native vs chrome vs desktop | review duplicate | |
| `case-rt` | absent/present | id / count / metadata | id / count / metadata | all surfaces | review test candidate | |
| `empty test folder` | absent/present | id / count / metadata | id / count / metadata | all surfaces | review test candidate | |
| `empty-rt` | absent/present | id / count / metadata | id / count / metadata | all surfaces | review test candidate | |
| `english-rt` | absent/present | id / count / metadata | id / count / metadata | all surfaces | review test candidate | |
| `f5d test folder` | absent/present | id / count / metadata | id / count / metadata | all surfaces | review test candidate | |

## Expected Interpretation

If native has exactly the six expected folders and Chrome/Desktop have more, the likely cause is preserved merge history, not a current native catalog problem.

If Chrome or Desktop has a folder ID with bindings that native does not have, that row requires review. It may represent prior test data, imported legacy data, or a real local-only folder.

If Chrome or Desktop shows zero folder counts while native shows non-zero counts, compare:

- canonical folder-state binding count from `items[folderId]`
- `LibraryIndex.facets().byFolder[folderId]`
- Desktop SQLite `listChats(folderId)`

The first is native membership. The latter two are known/saved/indexed local rows and can be lower without data loss.

## Next Phases

- Folders-P2: canonical parity report from the collected probe outputs.
- Folders-P3: non-destructive normalization plan.
- Folders-P4: user-approved duplicate/test-folder cleanup only.
- Folders-P5: "More" opens a dedicated folders page in Chrome Studio.
- Folders-P6: continuous parity validator / self-check.
- Folders-P7: optional manual repair button, non-destructive by default.

## Safety Checklist

Before any later cleanup phase:

- Confirm native canonical folder IDs.
- Confirm every duplicate folder's binding count.
- Confirm whether bindings point to real chats.
- Confirm whether visual metadata should be preserved.
- Generate a proposed cleanup report.
- Get explicit user approval.

P1 produces diagnostics only.
