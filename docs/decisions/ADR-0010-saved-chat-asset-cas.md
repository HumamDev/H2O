# ADR-0010: Saved Chat Asset CAS + Capability Gate

Status: Accepted (design); C2a capability gate landed 2026-06-23; C3.0 CAS layout locked 2026-06-23

Date: 2026-06-23

Related:

- [ADR-0009: Chat Saving Architecture - H2O Studio Archive Model](ADR-0009-chat-saving-architecture.md)
- [ADR-0008: Chrome Companion Surface + Desktop Professional Workspace Contract](ADR-0008-chrome-companion-desktop-professional-workspace-contract.md)
- [Saved Chat Package Format — Versioned Umbrella Spec](../systems/archive/saved-chat-package-format.md)
- [Saved Chat Package v1 Schema Spec](../systems/archive/saved-chat-package-v1.md)
- [Chat Saving Architecture — Phase B Closure Note](../systems/archive/chat-saving-phase-b-closure.md)

## Problem Statement

Phase B produces deterministic, asset-less saved-chat packages (`manifest.json`,
`snapshot.json`, `chat.md`, `chat.html`, `manifest.assets = []`). Phase C must add
binary asset preservation (images first) so saved chats keep their embedded content
offline and portable.

Two architectural questions must be decided **before any CAS code is written**,
because both are effectively irreversible once packages and stored bytes exist:

1. **Where do live binary assets live** on Desktop, and how does that relate to the
   sync lane's folder?
2. **What does the current Tauri capability set permit**, and what must change to
   store binaries safely?

This ADR records those decisions at the design level. It is part of the Phase C
**C1 docs-only** slice: it changes no capability, adds no migration, and ships no
CAS. The schema/hash detail lives in the
[umbrella format spec](../systems/archive/saved-chat-package-format.md).

## Decision

### 1. Phase C scope and ownership

- Phase C is **Desktop-only**. **Desktop Studio owns** the archive, the index, and
  the content-addressed store (CAS).
- **Chrome remains light.** Chrome may *request* or *hand off* a save; it never
  materializes packages, never owns the CAS, and never writes binary assets.
- **Sync is later transport only.** Phase C integrates no sync. Packages and asset
  blobs become transport payloads to the Sync lane only **after** archive/index/CAS
  are stable (see Consequences).
- **Packages remain deterministic projections**, never a second live mutable store.
  The single live mutation source of truth stays Desktop SQLite / `H2O.Studio.store`
  adapters (ADR-0009).

### 2. Live CAS location — app-owned, separate from the sync folder

- The **live/global CAS is app-owned Desktop archive storage**, located in the
  application's own **app-local-data** directory under `archive/assets/`. The
  concrete blob layout is locked in "C3.0 — Live CAS Layout & Boundaries" below
  (it is *not* the same layout as the per-package export copy).
- The CAS is **content-addressed and global/shared** across all chats and snapshots
  (one blob per unique `sha256` ⇒ dedup). It is **app-owned, not user-edited**.
- **The live CAS must NOT live inside `$HOME/H2O Studio Sync/`.** That folder
  belongs to the Sync lane; mixing the archive's source-of-truth bytes into the sync
  transport folder would entangle the two lanes and re-create the split-ownership
  failure mode ADR-0009 exists to prevent.
- **Per-package `assets/` is only a materialized export copy.** At package write
  time, referenced CAS blobs are copied into `<chatId>.h2ochat/assets/`. The package
  copy is portable; the live CAS stays the hot store.

### 3. Tauri capability / security gate

- **Current capabilities are insufficient for a binary CAS.** Today
  `apps/studio/desktop/src-tauri/capabilities/default.json` grants only **text**
  `fs` read/write and `mkdir`, and only under `$HOME/H2O Studio Sync/…`. There is
  **no binary `fs` read/write permission and no save-dialog permission**.
- A future implementation slice (**C2a**) requires a **narrow, security-reviewed**
  capability expansion:
  - binary `fs` read / write / mkdir **scoped to the app-owned archive/CAS root
    only**, and
  - a scoped save-location grant (e.g. save dialog) for the user-chosen package
    **export** target.
- **The C1 patch changed no capability.** The expansion was recorded as a gated
  prerequisite to be reviewed on its own before any byte-writing CAS code lands.
  → **Landed in C2a; see "C2a — Capability Boundary (landed)" below.**

## Consequences

- Phase C implementation is **docs-first and capability-gated**: C1 (this) → C2a
  (capability/security) → C2b (SQLite `assets` registry, Migration v14) → C3 (CAS + sanitizer +
  validator) → C4 (materialization with assets) → C5 (archive/index diagnostics).
  See the [umbrella spec](../systems/archive/saved-chat-package-format.md) slicing
  table.
- **Determinism is preserved.** Package `assets/` filenames are content hashes; the
  v2 `contentHash` payload uses the sorted asset `sha256` set only (no
  name/mime/size/path), so the same store snapshot hashes identically on any
  machine.
- **v1 packages remain valid.** Asset-less packages stay `schemaVersion 1` /
  `payloadVersion 1` with `contentHash = sha256(snapshot.json)`.
- **Privacy:** raw user images/files live in app-owned local storage under OS app
  permissions — **not** in a synced or cloud folder.
- **Sync handoff (future):** once stable, sync transports package bytes / CAS blobs
  **by content hash** (peers that already hold a `sha256` skip re-transfer). Sync
  never mutates the CAS or the `assets` registry directly; the archive stays source
  of truth. **Asset GC must coordinate with sync** (never collect a blob a peer
  still references), so Phase C ships **no automatic GC** — refcount only.

## Non-Goals / Deferred

This ADR does not implement and this patch does not include:

- CAS read/write code or any byte movement.
- Tauri capability changes (the binary fs grant is a future, separately-reviewed
  slice).
- SQLite migrations (the `assets` registry is design-only here).
- UI wiring (package materialization stays command/diagnostic-only first; a future
  Desktop archive action, never heavy Chrome UI).
- Sync integration / transport, WebDAV / cloud / relay.
- Import / recovery (rebuild DB from packages → Phase E).
- Remote-URL asset fetching (a capture concern).
- PDFs / non-image file types beyond the initial image slice.
- Automatic asset garbage collection.

## C2a — Capability Boundary (landed)

The C2a slice adds **only** the capability/security boundary — no CAS code, no DB
migration, no UI, no save dialog.

- **File:** `apps/studio/desktop/src-tauri/capabilities/archive-cas.json` — a new,
  isolated capability (`identifier: "archive-cas"`, `windows: ["main"]`),
  auto-loaded because `tauri.conf.json` sets no explicit `app.security.capabilities`
  list. `default.json` is intentionally left untouched so the Sync lane's existing
  fs scoping is unaffected.
- **Scope:** the app-owned archive root **`$APPLOCALDATA/archive`** (the CAS lives
  beneath it at `archive/assets/<aa>/sha256-<hex>` — layout locked in C3.0 below).
  `$APPLOCALDATA` keeps large binary content in non-roaming, app-owned storage.
- **Commands granted (least privilege):** `fs:allow-mkdir`, `fs:allow-exists`,
  `fs:allow-read-file` (binary), `fs:allow-write-file` (binary) — each scoped to
  `$APPLOCALDATA/archive` / `$APPLOCALDATA/archive/**` only.
- **Deliberately NOT granted:** `remove` / `rename` on the archive root (CAS blobs
  are content-addressed and immutable; no GC in Phase C), and any broad `$HOME` or
  unscoped `$APPLOCALDATA` access.
- **Separation:** the archive/CAS root is **not** under `$HOME/H2O Studio Sync/`;
  the Sync lane folder and the archive store remain distinct (ADR-0009).
- **Save/export dialog: deferred to C4.** C2a only opens the app-owned CAS root for
  the live store. A scoped save-location grant for materializing a package to a
  *user-chosen* export folder is needed only when C4 implements export, so it is
  intentionally not added here.

Note: the generated `gen/schemas/capabilities.json` is rebuilt by the Tauri
toolchain at build time and is not hand-edited by this patch.

## C3.0 — Live CAS Layout & Boundaries (locked)

C3.0 is a **docs-only** slice that freezes the concrete CAS layout and the C3
implementation boundaries before any C3 code is written. These decisions are
effectively irreversible once blobs exist on disk, so they are locked here first.
C3.0 adds **no** CAS code, **no** sanitizer code, and changes no capability.

### Live CAS layout (locked)

- **Live CAS root:** `$APPLOCALDATA/archive/assets`.
- **Live blob path:** `archive/assets/<aa>/sha256-<hex>`, where `<aa>` is the
  **first two hex characters** of the sha256 (prefix sharding).
- **Live blobs are extension-less.** The filename is the bare content hash; no
  `.<ext>` suffix.
- **Why:** extension-less storage lets `get(sha256)` / `exists(sha256)` resolve a
  blob purely from the hash with **no registry lookup** (keeps the CAS decoupled
  from `H2O.Studio.store.assets`); prefix sharding avoids one huge flat directory
  at thousands of blobs and is decided now so no later blob migration is needed.

### Package materialization layout (locked, distinct)

- The **export/package copy** remains **package-relative**:
  `assets/sha256-<hash>.<ext>`.
- The package copy **may include the extension** because the manifest `assets[*]`
  descriptors carry `ext` / `mimeType` (see
  [saved-chat-package-format.md](../systems/archive/saved-chat-package-format.md)).
- The **live CAS layout and the package export layout are intentionally
  different.** The live store is internal/extension-less/sharded; the package copy
  is portable/extension-bearing/flat. C4 is where the `.<ext>` is applied when
  copying a CAS blob into a package.

### Base-directory access (locked)

- C3's **primary** filesystem access pattern uses Tauri
  `BaseDirectory.AppLocalData` (**numeric token `15`**) with **relative paths**
  under `archive/assets/...`. This matches the C2a capability scope
  `$APPLOCALDATA/archive/**`.
- An absolute-path approach (resolve app-local-data via `plugin:path`, then use
  absolute paths) is an acceptable **fallback** if `write_file` + `baseDir` proves
  unsupported in the installed plugin version; an absolute path under the real
  app-local-data dir still satisfies the `$APPLOCALDATA/**` scope.
- **`$HOME/H2O Studio Sync/` is unrelated and MUST NOT host the live CAS.**

### DB path vs CAS path (accepted split)

- The SQLite DB (`sqlite:studio-v1.db`) may live in the **app-config** directory
  per `tauri-plugin-sql`'s default resolution.
- The CAS lives in **app-local-data**. On macOS these resolve to the same folder;
  on Linux/Windows they differ — that is **accepted**: both are app-owned, and
  large binary blobs belong in (non-roaming) local-data.
- **Do not move the DB path** as part of this lane. ADR-0010's earlier
  "alongside `studio-v1.db`" wording is superseded by this precise split.

### C3 CAS module scope (locked)

- The C3 CAS module (`src-surfaces-base/studio/ingestion/asset-cas.tauri.js`,
  namespace `H2O.Studio.ingestion.assetCas`) is **filesystem-only**.
- It **must not call `H2O.Studio.store.assets`**. Registry `upsert` and turn
  linking are **C4 caller** logic, not CAS responsibilities.
- Therefore `putAssetBytes` / `getAssetBytes` / `exists` / `describe` are
  **independently testable without SQLite**.

### Safe C4 cross-component write order (documented now)

When C4 wires CAS to the registry, the order is:

1. **Hash** the bytes (sha256).
2. **Write/dedup** the CAS blob (idempotent; returns once the blob is durable).
3. **Upsert** the `assets` registry row (`H2O.Studio.store.assets.upsert`).
4. **Link** the asset to its turn (`H2O.Studio.store.assets.linkToTurn`).

This ordering guarantees an interruption leaves **at worst an orphan blob** (or a
registry row with no link) — **never a referenced-but-missing asset**.

### Sanitizer centralization (locked targets, code deferred)

- C3 will centralize the sanitizer into a shared module **later** (C3.1) — **not
  in C3.0**.
- **Planned module:** `src-surfaces-base/studio/platform/html-sanitizer.js`.
- **Planned global:** `H2O.Studio.html.sanitize`.
- **Interim stance retained:** the Phase B hardened **regex sanitizer + CSP** stays
  in force; a DOM-based sanitizer and any validator DOM shim are **deferred**
  (validators are headless).

### C3 implementation slicing

- **C3.0** — this docs-only patch (layout + boundaries locked).
- **C3.1** — sanitizer centralization (shared module + projector rewire,
  behavior-preserving; existing projector validator must stay green).
- **C3.2** — CAS put/get module (filesystem-only) + focused validator.
- **C3.3 (optional)** — focused real-Tauri binary fs smoke to confirm the
  `write_file` + `baseDir` shape.

### Deferred explicitly in C3.0

No CAS code, no sanitizer code, no package asset materialization, no image
extraction, no `manifest.assets` emission, no `contentHash` v2 implementation, no
registry linking, no UI, no sync, no import/recovery, no WebDAV/cloud.

## Implementation Gate

No CAS, capability, migration, or UI work may begin until the C1 design (this ADR +
the umbrella spec) is accepted. The first implementing slice is **C2a**
(capability/security review), not CAS code. Within C3, the first slice is **C3.0**
(this docs lock), then **C3.1** (sanitizer), then **C3.2** (CAS code).
