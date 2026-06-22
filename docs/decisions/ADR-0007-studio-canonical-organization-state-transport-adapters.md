# ADR-0007: Studio Canonical Organization State + Transport Adapter Strategy

Status: Accepted

Date: 2026-06-22

Related:

- [ADR-0006: Shared Library Storage Tier](ADR-0006-shared-library-storage-tier.md)
- [F19.2 Chrome/Desktop Automatic Propagation Contract](../systems/cross-platform/f19.2-chrome-desktop-automatic-propagation-contract.md)
- [F10.8 WebDAV Cloud Relay Model](../systems/cross-platform/f10.8-webdav-cloud-relay-model.md)

## Context

Phase 3 Chrome/Desktop folder sync is now functionally closed for folder create, rename, and color propagation. The current local-folder transport supports automatic bidirectional propagation with targeted UI refresh behavior:

- Desktop color/create/rename to Chrome passes within roughly 3-5 seconds.
- Chrome color/create/rename to Desktop passes within roughly 10-15 seconds.
- Delete/tombstone propagation remains deferred.
- WebDAV remains a later transport adapter.
- Public release work remains later.

The reopened sync architecture work exposed several source-of-truth failures:

- Desktop could persist folder color to SQLite while the sidebar/export path still rendered stale folder-state mirror data.
- Chrome could display a synced/imported folder but fail mutation with `folder-not-found` because the mutation resolver routed visible Studio-owned rows through native ChatGPT owner resolution.
- Native ChatGPT folder ownership is not equivalent to H2O Studio organization ownership.
- Sync-driven UI refresh must be targeted and smooth; no-op imports must not trigger full sidebar or page refresh.

The current local folder transport (`latest.json` / `chrome-latest.json`) is the active transport. WebDAV, cloud, and relay transports are strategically useful, but they must not become alternate sources of truth.

Snapshot/full bundles remain useful as base/seed transport artifacts. Operation-log / F10.8 relay machinery exists conceptually, but activating it wholesale before the folder lifecycle is stable would add conflict and authority complexity too early.

## Decision

Studio owns the canonical organization layer.

The organization layer includes:

- folders
- folder colors
- folder names
- folder identity mapping
- tags/categories
- chat-folder bindings
- organization metadata needed for render/export/import parity

Native ChatGPT is an ingest/capture adapter, not the mutation authority for H2O organization state.

Transport implementations are adapters, not sources of truth:

- local folder transport is the current active adapter
- WebDAV is a later scheduled adapter
- cloud/relay may be optional later adapters
- snapshot/full bundles remain base/seed transport artifacts
- operation log / F10.8 relay should not be activated wholesale yet

Future transports must consume and emit the same canonical Studio organization contract. They must not introduce independent identity, ownership, conflict, or mutation semantics.

Operation-log or relay components may be selectively reused later after the core create/rename/color/delete lifecycle is stable and after destructive sync semantics are explicitly designed.

## Consequences

This gives the sync architecture one clear owner for organization state.

Benefits:

- reduces native-owner mismatch bugs
- avoids Chrome visible-row / native-owner `folder-not-found` failures
- makes WebDAV a transport implementation, not an architecture fork
- keeps Desktop and Chrome aligned around one canonical identity resolver
- keeps local-first behavior as the default sync model

Required follow-up work:

- maintain a canonical folder identity resolver
- maintain a mutation contract for create/rename/color/delete eligibility
- preserve targeted UI refresh semantics for sync-driven updates
- design delete/tombstone policy before enabling destructive propagation
- keep diagnostics explicit for pending, blocked, permission-required, no-op, and conflict states

Sync-driven UI refresh must be targeted, debounced, and no-op aware. Full-page or full-Studio refresh should be avoided unless absolutely necessary.

Risks:

- Studio must own more organization reconciliation logic.
- Native ChatGPT folder changes may need adapter-specific import/ingest handling.
- Transport adapters must stay disciplined and not grow authority logic.

## Non-Goals

This ADR does not cover:

- public release signing/notarization
- Billing or Identity UI
- WebDAV implementation now
- cloud/relay implementation now
- delete propagation now
- destructive tombstone lifecycle implementation
