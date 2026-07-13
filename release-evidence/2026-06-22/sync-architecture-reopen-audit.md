# Sync Architecture Reopen — Deep Folder-Sync Audit (Desktop ↔ Chrome)

Date: 2026-06-22
Status: **AUDIT ONLY — no code changed.** Reopens the RC runtime-parity lane that was closed in `927a542` / attested in `d79ff49` / `98062e6`, after live testing found folder-mutation and auto-sync gaps.
Scope guard: folders only. No Identity UI / Billing / onboarding / signing / notarization / peer-watermarks / retention-purge (beyond folder delete policy). No s-file deletion/moves.

---

## A. Current Architecture Map

### A.1 Canonical source files (loaded by BOTH surfaces; gated at runtime)

All folder logic lives in `h2o-cp-source/src-surfaces-base/studio/`. The same files load on Desktop (Tauri) and Chrome (MV3); each module self-gates with `detectTauri()` / `detectChromeRuntime()` / `studioPlatformAdapter()`. Built copies exist under `apps/studio/desktop/dist/` and `apps/extensions/chatgpt/chrome/{prod,studio-launcher}/` — **edit the base, never the dist copies.**

| Concern | File | Key symbol |
|---|---|---|
| Desktop write API (SQLite) | `S0F3b. 🎬 Folders Actions - Studio.js` | `H2O.Studio.actions.folders.{create,rename,update,remove}` |
| Desktop editor facade | `S0F1m. 🎬 Library Organization Modals - Studio.js` | `OrganizationModals.openFolderEditor` |
| Identity + render model | `S0F1b. 🎬 Library Workspace - Studio.js` | `FolderParity.getDisplayModel` → `diagnoseFolderParity` → `buildFolderDisplayRows` |
| Sidebar render + action menu | `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` | `renderFolders`, `requestCanonicalFolder{Color,Create,Rename,DeletePreview,DeleteApply}`, `getRowAppearance` |
| Chrome mutation bridge | `S0F1h. 🎬 Library Sync - Studio.js` | `H2O.Studio.sync.folderMetadataOperations.request` |
| Native owner (chatgpt.com) | `src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` | `META_previewColorOperation`, `META_apply*`, supported ops `['change-folder-color','rename-folder','delete-folder']` |
| Desktop→Chrome export | `sync/auto-export.tauri.js` + `ingestion/export-bundle.tauri.js` | `autoExport.schedule/flushNow`, `exportLatestSyncBundle` |
| Desktop→Chrome export trigger | `sync/folder-sync.tauri.js` | `syncNow({direction:'desktop-to-chrome'})` |
| Chrome import of latest.json | `sync/folder-import.mv3.js` | `H2O.Studio.sync.folder.importLatestBundle`, `syncNow`, focus/visibility auto-sync |
| Chrome→Desktop export | `sync/auto-import.mv3.js` (misnamed; it is the **Chrome exporter**) | writes `chrome-latest.json` |
| Desktop import of chrome-latest.json | `sync/focus-import.tauri.js` | `focusImport.enable`, focus/visibility trigger |

### A.2 Source-of-truth per platform (this is the crux)

**Desktop has TWO folder stores that are not reconciled on mutation:**

1. **SQLite folders table** — the *write* target of `actions.folders.*` (`store.folders.patch/create/remove`). Read back via `getFolders({fresh})` (`S0F1b:940`) → `localFolders`.
2. **Folder-state mirror** `FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1'` — the *render* source (canonical rows) AND the export source. Written only by the **native folder-state merge** in `S0F1h:970` (fed by native broadcast / imported bundles), **never by a local color/rename edit.**
3. **Hardcoded fallback** `KNOWN_NATIVE_CANONICAL_FOLDERS` (`S0F1b:63-69`): Study/Case/Dev/Code/Tech/English with fixed ids, used when (1)+(2) are empty.

**Chrome:** the **native ChatGPT folder catalog** (owned by the chatgpt.com tab, `0F3a`) is the mutation authority. It is broadcast into `NATIVE_BROADCAST_KEY` and merged into `FOLDER_STATE_DATA_KEY`. The Chrome sidebar additionally shows folders imported from the Desktop bundle (`latest.json`) and the hardcoded fallback. So the Chrome *display* catalog is a superset of what the native owner can *mutate*.

### A.3 Canonical display pipeline (both surfaces)

`renderFolders` (`S0Z1g:3061`) → `FolderParity.getDisplayModel({fresh:true})` (`S0F1b:2473`) → `diagnoseFolderParity` (`S0F1b:1930`):
- `mergedTrustedCanonical = storedState(FOLDER_STATE_DATA_KEY) || nativeState(NATIVE_BROADCAST_KEY) || {}` → if non-empty, `canonicalMirrorAvailable = true`.
- `buildFolderDisplayRows` (`S0F1b:1514`) marks a row `isCanonical` if `isPrimaryCanonicalFolder || protectedCanonicalFallback || isStoredFolderStateRow || isMaterializedUserFolder` (`S0F1b:629`).
- Per-row color resolution: `mergeCanonicalFolderDisplaySource` (`S0F1b:646`) starts from the canonical/mirror row and only borrows the local SQLite color **when `!canonicalMirrorAvailable` AND the canonical row has no color** (`S0F1b:657-663`).
- Sidebar paints canonical color as `row.iconColor || row.color` (`S0Z1g:528-530`, `S0Z1g:3119-3121`). For canonical folders the local appearance store is intentionally ignored.

### A.4 Create / rename / color / delete flow per platform

**Desktop (`studioPlatformAdapter()==='tauri'`):** `S0Z1g.requestCanonicalFolder*` → `canUseDesktopFolderEditor` true → `requestDesktopFolderEditor` (`S0Z1g:1365`) → `OrganizationModals.openFolderEditor` → `actions.folders.{create,rename,update,remove}` → SQLite. Success toast ("Color updated"/"Folder renamed") is shown on `result.ok` from the SQLite write, then `refreshAfterNativeFolderMetadataApply` → `renderAllSections`.
- **Delete is NOT wired on Desktop:** `requestCanonicalFolderDeletePreview/Apply` hard-require `studioPlatformAdapter()==='mv3'` (`S0Z1g:1496,1551`), and the desktop bridge supports only `['rename-folder','change-folder-color']` (`S0F1h:72`). Desktop folder delete is reachable only via console `H2O.Studio.actions.folders.remove`.

**Chrome (`mv3`):** `S0Z1g.requestCanonicalFolder*` → `folderMetadataOperations.request` (`S0F1h:1933`) builds a `{create|rename|change|delete}-folder` operation with `folderId = item.id || item.folderId` → `broadcastFromStudio` to native owner → waits (preview then apply, stale-guarded) → native owner `0F3a` resolves against the live catalog and replies. Toast reflects the native owner's blockers/`applied`.

### A.5 Export / import / auto-sync flow

| Leg | Writer | Reader | Trigger | Default |
|---|---|---|---|---|
| Desktop → Chrome | `autoExport` → `latest.json` | `folder-import.mv3.syncNow/importLatestBundle` | export: SQLite store `subscribe` (debounced 2 s); import: `focus`+`visibilitychange` | **OFF** (both flags) |
| Chrome → Desktop | `auto-import.mv3` → `chrome-latest.json` (user-gesture) | `focus-import.tauri.scanFolderOnce` | export: whitelisted library events (debounced 2 s); import: `focus`+`visibilitychange`, 30 s min | **OFF** (all flags) |

There is **no file watcher and no polling anywhere** (explicit safety invariant in every header). Every leg is independently opt-in and OFF by default in prod.

---

## B. Root-Cause Hypotheses (ranked)

### B1 — Desktop "Color updated" but no visual change  *(confidence: HIGH)*
The mutation writes **SQLite**; the sidebar renders from the **folder-state mirror / canonical model**, and `mergeCanonicalFolderDisplaySource` (`S0F1b:657-663`) **discards the local SQLite color whenever `canonicalMirrorAvailable` is true** (i.e. whenever `FOLDER_STATE_DATA_KEY` or native broadcast holds the folder). The mirror is updated only by the sync merge (`S0F1h:970`), never by a local color edit, so the rendered color is frozen to the last imported/broadcast value. The toast fires on the SQLite write succeeding (`S0Z1g:1116`), independent of whether the render source changed → **misleading success**.
- Secondary: the RC attestation validated `FolderParity.diagnoseSidebar` (which can show the SQLite value) rather than the actual painted swatch — a diagnostic-vs-visual gap that produced false confidence. The `1f03246` regression note only fixed the *export* staleness and explicitly *assumed* "Desktop has the new color locally."
- Conditional: if a given Desktop install has an empty mirror (`canonicalMirrorAvailable===false`) and "Sport" is a pure `materializedUserFolder`, the color *will* update — which is exactly why this reproduces intermittently and was missed.

### B2 — Chrome "Blocked: folder-not-found"  *(confidence: HIGH)*
Chrome routes every folder mutation to the **native ChatGPT owner** (`folderMetadataOperations.request` → broadcast → `0F3a`). The native owner resolves `folderId` against the **live native catalog only** and returns `folder-not-found` (`0F3a:2110/2255/2531`) for any folder it does not own — which includes every Desktop-created/imported folder ("Sport") and any stale `KNOWN_NATIVE_CANONICAL_FOLDERS` fallback row shown when the broadcast is absent. The Chrome sidebar can **display** a merged catalog (native + imported + fallback) but can only **mutate** native-owned folders. The selected sidebar record carries the correct id; the id simply has no native backing.

### B3 — Automatic sync not firing reliably  *(confidence: HIGH)*
1. All four legs are independent opt-in flags **defaulting OFF** (`auto-export.tauri.js:9,42`; `auto-import.mv3.js:29`; `folder-import.mv3.js:115`; `focus-import.tauri.js` `sync.desktopImportOnFocus`). Out of the box nothing is automatic.
2. Triggers are `focus`/`visibilitychange`, not data-change-to-peer. A color edit produces nothing until the user switches windows; there is no watcher/poll to close the loop.
3. Chrome→Desktop export needs a **user gesture** for File System Access; a bare focus event may not satisfy the readwrite re-prompt.
4. Per-leg 2 s debounce + Desktop 30 s import floor + the documented **Tauri webview boot race** (focus/visibility firing at startup) make timing non-deterministic.
5. `autoExport` historically wired a **partial** store-subscription set if it initialized before `folders` registered (fixed in `1f03246`, but the brittleness illustrates the fragility).

### B4 — Create / delete lifecycle not proven  *(confidence: MEDIUM-HIGH)*
- **Desktop delete from the sidebar is unavailable** (mv3-gated preview/apply; desktop bridge omits `delete-folder`). Only `actions.folders.remove` via console works.
- **Delete of a synced folder in Chrome** hits B2 (`folder-not-found`) because it isn't native-owned.
- **Create** on Desktop produces a `materializedUserFolder`; whether it shows depends on the mirror/canonical path (B1 family). Create on Chrome routes to native owner and only persists native-side.
- No end-to-end automatic create/rename/color/delete propagation has a passing runtime proof; existing validators (§F) assert *file/projection* shape, not live two-way convergence.

---

## C. Recommended Target Architecture

1. **One canonical folder mutation contract.** A single `H2O.Studio.folders.mutate({op, folderId, after, sourceSurface})` that every UI entry point calls, returning `{ok, applied, status, folderId, after, blockers[]}`. Desktop and Chrome implement the same contract behind one resolver; the sidebar never branches on platform.
2. **One canonical identity resolver.** `resolveFolder(idOrName) → {folderId, normalizedName, sourceKind, owner: 'native'|'desktop-sqlite'|'mirror'|'fallback', mutable: bool}`. `mutable=false` (e.g. fallback rows, or Desktop folders viewed in Chrome) must disable the mutation menu with a clear reason instead of emitting `folder-not-found` after the fact.
3. **One canonical color resolver.** `resolveFolderColor(folderId)` precedence must include the **owning store's freshest value**. On Desktop, a local SQLite edit must win over a stale mirror (invert the current `S0F1b:657-663` rule, or write the edit through to the mirror — see #4).
4. **Owner/bridge rules.**
   - Desktop owns Desktop-origin folders in SQLite; **every Desktop mutation must also update the `FOLDER_STATE_DATA_KEY` mirror** (or the render path must read SQLite first for owned folders) so display = persistence = export.
   - Chrome owns nothing; native ChatGPT is the authority for native folders. Desktop-origin folders shown in Chrome are **read-only mirrors** and must be presented as such until/unless a Desktop-owned mutation channel exists.
5. **Automatic export/import rules.** A "Premium Sync ON" master switch that enables all four legs together, plus a **data-change → export → peer-import** path that does not depend on window focus (e.g. Desktop writes `latest.json` on every committed folder mutation; Chrome imports on a short reconcile after each native broadcast and on its own auto-import trigger). Keep user-gesture compliance for FSA but pair it with a visible "Sync now" affordance when a gesture is required.
6. **Delete/tombstone policy (premium default).** Soft tombstone with bounded propagation: delete writes a `tombstone{folderId, deletedAt, sourcePeer}` into the bundle; peers hide the folder and (default) **unbind** member chats to Unfiled rather than deleting chats. Hard delete stays operator-gated (the current "DELETE EMPTY FOLDER" + empty-only path). Never auto-delete a non-empty folder across peers.
7. **Conflict/staleness rules.** Carry `updatedAt` + `sourcePeer` + `exportId`/`sequenceNumber` per folder row; apply last-writer-wins on `updatedAt` with `sourcePeer` tiebreak; skip strictly-older incoming rows (the import already computes `skippedStale`); surface simultaneous-edit conflicts in the existing convergence-review UI rather than silently merging.
8. **UI feedback rules.** Toast success **only after the resolver confirms the render/persistence source changed** (`applied===true` AND the canonical color/name token moved). For non-mutable rows, disable the control with the reason up front.

---

## D. Implementation Plan (small phases)

1. **Local mutation correctness.** Make Desktop color/rename/create write through to the render/export source (mirror or SQLite-first read) so the sidebar repaints from the same bytes it persisted. Gate the success toast on a confirmed canonical-token change. (Chrome local correctness = present non-mutable rows as read-only.)
2. **Canonical resolver + folder-not-found.** Add the identity resolver with `owner`/`mutable`; disable the action menu (with reason) for non-mutable rows instead of letting the native owner reject them. Map every native `folder-not-found` to a pre-flight "not editable here" state.
3. **Visual rerender consistency.** Single color resolver consumed by both `getRowAppearance` and `toSidebarItem`; ensure `renderFolders` re-reads fresh after a confirmed mutation (it already passes `{fresh:true}` — the fix is the source, not the call).
4. **Automatic export triggers.** Drive `latest.json`/`chrome-latest.json` writes from committed folder mutations (not just store-subscribe debounce); fix any remaining partial-subscription wiring; add a master "Premium Sync" enable that flips all four flags.
5. **Automatic import triggers.** Add a bounded reconcile-after-broadcast on Chrome and a short post-import refresh on Desktop; keep focus/visibility as supplementary, add an explicit "Sync now" for gesture-required FSA writes.
6. **Validators for lifecycle sync.** Extend `tools/validation/sync/` to assert two-way create/rename/color/delete convergence (not just file shape) — see §F.
7. **Runtime smoke diagnostic.** Ship a one-click **Folder Sync Health** (see §7 below).
8. **Evidence + closure criteria.** New evidence note + a green G-matrix run before re-closing the lane.

---

## E. Exact files likely needing changes

- `h2o-cp-source/src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js` — `mergeCanonicalFolderDisplaySource` color precedence (`:646-667`); ensure owned-folder edits surface.
- `h2o-cp-source/src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js` — write the mirror (or emit a mirror-sync) after `update`/`rename`/`create`/`remove`.
- `h2o-cp-source/src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js` — resolver + `mutable` gating of the action menu; toast-on-confirmed-change; Desktop delete wiring (`:1104-1615`, menu builders `:1741/1869/2070/2088/2574`).
- `h2o-cp-source/src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js` — pre-flight resolvability so Chrome never round-trips to `folder-not-found`; desktop bridge `delete-folder` support if Desktop delete is in scope (`:72,1933`).
- `h2o-cp-source/src-surfaces-base/studio/sync/auto-export.tauri.js`, `sync/folder-import.mv3.js`, `sync/auto-import.mv3.js`, `sync/focus-import.tauri.js` — master "Premium Sync" switch + data-change-driven triggers.
- `h2o-cp-source/src-surfaces-base/studio/ingestion/export-bundle.tauri.js` — carry `updatedAt`/`sourcePeer`/`sequenceNumber` + tombstones (color already serialized: `:325-340`).
- `h2o-cp-source/src-surfaces-base/studio/S0F1m. 🎬 Library Organization Modals - Studio.js` — only if the editor facade needs the new contract.
- (Read-only authority) `h2o-cp-source/src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` — confirm pre-flight contract; avoid touching native UI.

## F. Tests / validators to add or update

- `tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs` + `…-chrome-desktop-propagation.mjs` — extend from file-shape to asserting the **rendered canonical color/name token** changes after each op.
- New: `validate-folder-lifecycle-convergence.mjs` — drives create/rename/color/delete both directions against fixture bundles and asserts tombstone + unbind semantics.
- `validate-f7-folder-metadata-hash-parity.mjs` — add stale-guard + `updatedAt` last-writer-wins cases.
- New smoke: `validate-folder-mutation-mutability.mjs` — asserts non-mutable rows are gated *before* a native round-trip (no `folder-not-found` reachable from the menu).
- Keep `node --check` on every touched s-file (existing hygiene).

## G. Manual runtime test matrix (must all pass to re-close)

| # | Action | Expected (automatic, no console) |
|---|---|---|
| 1 | Desktop create folder | Appears in Chrome sidebar automatically |
| 2 | Chrome create folder | Appears in Desktop sidebar automatically |
| 3 | Desktop change color | Desktop swatch changes immediately **and** Chrome swatch follows automatically |
| 4 | Chrome change color | Chrome swatch changes (or read-only-with-reason if Desktop-owned) **and** Desktop follows |
| 5 | Desktop rename | Chrome name follows automatically |
| 6 | Chrome rename | Desktop name follows automatically |
| 7 | Desktop delete | Chrome tombstones/removes automatically; member chats → Unfiled |
| 8 | Chrome delete | Desktop tombstones/removes automatically; member chats → Unfiled |
| 9 | Conflict: same folder edited on both peers offline, then sync | Deterministic last-writer-wins by `updatedAt`/`sourcePeer`; conflict surfaced, no data loss |

Add to the existing diagnostics a **one-click "Folder Sync Health"** reporting, per surface: adapter; the four flag states; last export/import timestamps + bytes + checksum; `canonicalMirrorAvailable`; SQLite-vs-mirror color divergence per folder; pending folderMetadata requests + last blockers; and a per-row `mutable`/`owner`/`folder-not-found-risk` flag. This is the missing instrument that would have caught B1/B2 before closure.

---

## Final Verdict

**Is current folder sync release-grade? — No.** It is a manual, opt-in, focus-triggered bridge with a split-brain folder store on Desktop and a display-vs-mutation authority mismatch on Chrome. It does not meet the "professional premium / automatic both ways" bar.

**Biggest blocker:** the **split source-of-truth**. Desktop mutates SQLite while rendering+exporting from the folder-state mirror (which a local edit never updates), and Chrome can display folders it cannot mutate (native owner rejects them). Both reported symptoms (Desktop color not changing, Chrome `folder-not-found`) are the same root disease: **mutation target ≠ render/authority source.** Until there is one identity resolver and one mutation contract that keep persistence = render = export, automatic lifecycle sync cannot be trusted.

**Smallest safe next Codex implementation prompt:**
> In `h2o-cp-source/src-surfaces-base/studio`, make Desktop folder **color** mutations reflect locally and stay consistent for export. Specifically: after `H2O.Studio.actions.folders.update` succeeds in `S0F3b`, write the new `color`/`iconColor`/`updatedAt` through to the `FOLDER_STATE_DATA_KEY` ('h2o:prm:cgx:fldrs:state:data:v1') folder-state mirror for that `folderId` (Desktop/Tauri only); and in `S0F1b` `mergeCanonicalFolderDisplaySource` (`:646-667`) let a fresher local SQLite color override the canonical/mirror color for Desktop-owned (`materializedUserFolder`/`stored-folder-state`) rows. Only show the "Color updated" toast in `S0Z1g` (`requestCanonicalFolderColor`) after `getDisplayModel({fresh:true})` confirms the canonical color token for that folder changed. Do not touch Chrome/native paths, delete policy, or other sync legs. Add `node --check` on the three edited s-files and a unit assertion that the rendered canonical color equals the persisted SQLite color after an update.

**Recommended phase order:** 1 → 2 → 3 → 7 (ship the health diagnostic early to instrument the rest) → 4 → 5 → 6 → 8. Local correctness and observability first; automatic transport last, behind a single "Premium Sync" switch.
