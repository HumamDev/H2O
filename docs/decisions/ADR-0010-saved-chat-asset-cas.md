# ADR-0010: Saved Chat Asset CAS + Capability Gate

Status: Accepted (design; implementation gated)

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
  application's own data directory **alongside `studio-v1.db`** (app-local data),
  e.g. `<appArchiveRoot>/assets/sha256-<hex>.<ext>`.
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
- **This patch changes no capability.** The expansion is recorded here as a gated
  prerequisite and must be reviewed on its own before any byte-writing CAS code
  lands.

## Consequences

- Phase C implementation is **docs-first and capability-gated**: C1 (this) → C2a
  (capability/security) → C2b (SQLite v7 `assets` registry) → C3 (CAS + sanitizer +
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

## Implementation Gate

No CAS, capability, migration, or UI work may begin until the C1 design (this ADR +
the umbrella spec) is accepted. The first implementing slice is **C2a**
(capability/security review), not CAS code.
