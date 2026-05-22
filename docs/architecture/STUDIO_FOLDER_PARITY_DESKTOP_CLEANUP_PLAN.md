# Studio Folder Parity Desktop Cleanup Plan

## Purpose

Folders-P7d covers Desktop-aware review for the remaining F5D/Desktop-related folder candidates after Chrome mirror cleanup. This document is a plan only. It does not implement cleanup, deletion, binding movement, SQLite writes, Chrome storage writes, or native ChatGPT folder-state mutation.

The remaining work is riskier than earlier Chrome mirror cleanup because Desktop Studio stores folders and bindings in SQLite. A folder that appears like a test folder can still have real `folder_bindings` rows, so cleanup must inspect Desktop bindings before any future mutation.

## Why Desktop Is Separate

Chrome cleanup affects only the `chrome.storage.local` folder mirror, specifically `h2o:prm:cgx:fldrs:state:data:v1`.

Desktop cleanup affects SQLite-backed `folders` and `folder_bindings`. Desktop has real deletion APIs and at least one known binding was previously observed:

```text
f5d1-test-chat-001 -> f5d1-test-folder-b
```

Therefore Desktop cleanup must be separate from Chrome cleanup, stricter, and binding-aware. A future Desktop action must show the target store, exact folder ID, exact folder name, exact bindings, and exact risk before approval.

## Remaining Candidates

Known F5D/Desktop-related candidates:

| Folder ID | Name | Status |
| --- | --- | --- |
| `f5d-test-folder-001` | F5D Test Folder | Review-required until Desktop and Chrome probes confirm bindings/state. |
| `f5d1-test-folder-a` | F5D.1 Test Folder A | Review-required until Desktop and Chrome probes confirm bindings/state. |
| `f5d1-test-folder-b` | F5D.1 Test Folder B | Review-required if it still has or had `f5d1-test-chat-001`. |

`f5d1-test-folder-b` must not be treated as a safe empty-delete candidate unless Desktop probe results prove there are no bindings and no known rows.

## Desktop Probe

Run this in Desktop Studio DevTools:

```js
await (async () => {
  const H = window.H2O || window.W?.H2O;
  const foldersStore = H?.Studio?.store?.folders;
  const parity = H?.Library?.FolderParity;

  const callMaybe = async (obj, names, ...args) => {
    for (const name of names) {
      if (typeof obj?.[name] === "function") {
        try { return { method: name, ok: true, value: await obj[name](...args) }; }
        catch (err) { return { method: name, ok: false, error: String(err?.stack || err?.message || err) }; }
      }
    }
    return { method: null, ok: false, error: "no method available" };
  };

  const foldersResult = await callMaybe(foldersStore, ["list", "getAll", "listFolders"]);
  const allFolders = Array.isArray(foldersResult.value) ? foldersResult.value : [];
  const f5dFolders = allFolders.filter(f => /f5d/i.test(`${f?.folderId || f?.id || ""} ${f?.name || ""}`));

  const bindingMethods = [
    "listBindings",
    "getBindings",
    "listFolderBindings",
    "bindingsForFolder",
    "getFolderBindings"
  ];

  const bindingResults = [];
  for (const folder of f5dFolders) {
    const folderId = String(folder.folderId || folder.id || "");
    const result = await callMaybe(foldersStore, bindingMethods, folderId);
    bindingResults.push({ folderId, result });
  }

  return {
    surface: "desktop-studio",
    selfCheck: typeof parity?.selfCheck === "function" ? await parity.selfCheck({ fresh: true }) : null,
    storeMethods: Object.keys(foldersStore || {}).filter(k => typeof foldersStore[k] === "function").sort(),
    diagnose: typeof foldersStore?.diagnose === "function" ? await foldersStore.diagnose() : null,
    folderCount: allFolders.length,
    f5dFolders,
    f5dBindingResults: bindingResults,
    deleteMethodsAvailable: Object.keys(foldersStore || {}).filter(k => /delete|remove/i.test(k) && typeof foldersStore[k] === "function")
  };
})();
```

## Chrome Probe

Run this in Chrome Studio DevTools:

```js
await (async () => {
  const KEY = "h2o:prm:cgx:fldrs:state:data:v1";
  const AUDIT = "h2o:studio:folder-cleanup-audit:v1";
  const getLocal = keys => new Promise(r => chrome.storage.local.get(keys, r));
  const H = window.H2O || window.W?.H2O;

  const storage = await getLocal([KEY, AUDIT]);
  const state = storage[KEY] || {};
  const audit = storage[AUDIT] || [];
  const folders = Array.isArray(state.folders) ? state.folders : [];
  const items = state.items || {};
  const f5dFolders = folders.filter(f => /f5d/i.test(`${f?.id || f?.folderId || ""} ${f?.name || ""}`));

  return {
    surface: "chrome-studio",
    selfCheck: await H.Library.FolderParity.selfCheck({ fresh: true }),
    f5dFolders: f5dFolders.map(f => {
      const id = String(f.id || f.folderId || "");
      const bucket = items[id];
      return {
        folderId: id,
        name: f.name,
        raw: f,
        bucketExists: Object.prototype.hasOwnProperty.call(items, id),
        bucketIsArray: Array.isArray(bucket),
        bucketCount: Array.isArray(bucket) ? bucket.length : 0,
        bucket
      };
    }),
    auditTail: Array.isArray(audit) ? audit.slice(-10) : audit,
    folderStateSummary: {
      folderCount: folders.length,
      itemBucketCount: Object.keys(items).length,
      bindingCount: Object.values(items).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0)
    }
  };
})();
```

## Candidate Classes

| Class | Meaning |
| --- | --- |
| `desktop-bound-review-candidate` | Exists in Desktop SQLite and has one or more bindings. Never delete in the empty-folder phase. |
| `desktop-empty-test-candidate` | Exists in Desktop SQLite, is native-absent, and has zero bindings after probe verification. |
| `chrome-only-extra-candidate` | Exists only in Chrome mirror, is native-absent, and has a missing or empty bucket. |
| `cross-surface-candidate` | Exists in both Chrome mirror and Desktop SQLite. Requires separate Chrome and Desktop decisions. |
| `not-eligible` | Canonical/native-present, bound, malformed, referenced by known rows, or otherwise unsafe. |

## Review Object

Future review UI should normalize each candidate into this shape:

```js
{
  folderId,
  name,
  surface: "desktop" | "chrome-studio",
  store: "sqlite" | "chrome-storage",
  existsInNative,
  existsInChromeMirror,
  existsInDesktopSqlite,
  bindingCount,
  bindings,
  knownChatRows,
  proposedAction,
  riskLevel,
  requiresApproval,
  warnings,
  deletionEligible,
  blockers
}
```

## Future Desktop Deletion Eligibility

Desktop deletion can only be considered in a future phase when all of these are true:

- Folder is non-canonical.
- `nativePresence` is false.
- `bindingCount` is `0`.
- No known saved/chat rows depend on it.
- It is not referenced by Chrome canonical or mirror state.
- The runtime is Desktop Studio.
- The exact folder is selected by the user.
- The user provides typed confirmation.
- An audit record is written before mutation.

If any condition fails, the folder is review-only.

## Bound Folder Policy

If `f5d1-test-folder-b` still has `f5d1-test-chat-001`:

- Do not delete automatically.
- Show the exact binding.
- Classify it as a bound review candidate.
- Possible future options are:
  - keep the folder;
  - remove the binding only if the chat is confirmed test/nonexistent and explicitly approved;
  - move the binding only with an approved canonical target;
  - delete the folder only after the binding is reviewed and removed.

None of those actions are implemented in P7d documentation.

## Future P7d-a UI Plan

Location:

```text
Settings -> Folder Parity -> Desktop Cleanup Review
```

The read-only UI should show:

- Desktop F5D candidates.
- Chrome mirror F5D candidates.
- Binding counts.
- Exact bindings.
- Store and surface badges.
- Risk and blocker text.
- `Copy Desktop cleanup report JSON`.

P7d-a must not include delete controls.

## Future Phases

- P7d-a: Desktop cleanup review UI, no mutation.
- P7d-b: Desktop empty test folder deletion, explicit confirmation and audit.
- P7d-c: bound test folder binding review.
- P7d-d: optional Chrome/Desktop consistency repair after Desktop review.

## Safety Boundaries

- No automatic Desktop cleanup.
- No cleanup on boot.
- No cleanup from `selfCheck`.
- No hidden SQLite writes.
- No native ChatGPT folder-state mutation.
- No schema changes in this plan.
- No cross-surface clean-all button.
- No folder with bindings can be deleted without explicit binding review and approval in a future phase.
- Chrome cleanup and Desktop cleanup must remain separate actions.
