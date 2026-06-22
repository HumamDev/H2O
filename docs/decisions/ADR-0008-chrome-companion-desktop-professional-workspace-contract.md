# ADR-0008: Chrome Companion Surface + Desktop Professional Workspace Contract

Status: Accepted

Date: 2026-06-22

Related:

- [ADR-0007: Studio Canonical Organization State + Transport Adapter Strategy](ADR-0007-studio-canonical-organization-state-transport-adapters.md)
- [ADR-0006: Shared Library Storage Tier](ADR-0006-shared-library-storage-tier.md)
- [F19.2 Chrome/Desktop Automatic Propagation Contract](../systems/cross-platform/f19.2-chrome-desktop-automatic-propagation-contract.md)

## Context

H2O Studio now runs across Chrome MV3 and Desktop/Tauri surfaces.

Chrome has browser-extension constraints:

- MV3 lifecycle and permission limits
- File System Access permission requirements
- smaller practical storage/runtime budgets
- higher sensitivity to UI refresh flicker
- need to stay close to capture and quick organization workflows

Desktop/Tauri has broader professional-workspace capabilities:

- local filesystem and SQLite access
- richer archive/search/bulk workflows
- backup/restore workflows
- operator diagnostics
- conflict review surfaces
- heavier sync/import/export orchestration

The product strategy decision is:

- Chrome Studio is a light companion/capture/basic organization surface.
- Desktop Studio is the full professional/canonical workspace.
- Studio owns organization state across both surfaces.
- Native ChatGPT remains an ingest/capture adapter.

## Decision

Chrome Studio is the companion surface.

Chrome supports:

- capture
- quick save
- basic library browsing
- basic folder create/rename/color
- basic sync status
- lightweight diagnostics for permission, pending, blocked, and no-op states

Chrome may expose basic sync and organization workflows, but it must not become the heavy archive/indexing/conflict-review surface.

Desktop Studio is the full professional workspace.

Desktop owns:

- heavy archive workflows
- full search and analysis
- bulk operations
- backup/restore
- conflict review
- operator diagnostics
- durable sync management
- advanced import/export evidence

Chrome should not attempt to become functionally equal to Desktop. Features that require heavy local state, long-running jobs, broad diagnostics, destructive review, or professional workspace layout belong in Desktop first.

## Feature Contract

| Feature | Chrome Role | Desktop Role | Sync Requirement | Reason |
|---|---|---|---|---|
| Capture current chat | Primary quick capture | Full archive ingestion and review | Must sync both ways where captured records become library records | Chrome is closest to browser context; Desktop owns durable workspace. |
| Save to folder | Quick action | Full organization action | Must sync both ways | Basic organization must feel consistent across surfaces. |
| Folder create | Basic create | Full create/manage | Must sync both ways | Phase 3 proves safe non-destructive lifecycle. |
| Folder rename | Basic rename | Full rename/manage | Must sync both ways | Phase 3 proves safe non-destructive lifecycle. |
| Folder color | Basic color edit | Full color/edit management | Must sync both ways | Phase 3 proves safe non-destructive lifecycle. |
| Folder delete | Not enabled for propagation yet | Future reviewed destructive flow | Deferred/high-risk | Requires tombstone and conflict policy. |
| Tags/categories | Basic visibility or light edit only when safe | Full taxonomy management | Desktop-primary, visible in Chrome; write scope requires separate contract | Larger taxonomy behavior needs stable conflict rules. |
| Chat-folder bindings | Quick bind/unbind where safe | Full binding management and repair | Must sync both ways after lifecycle contract | Core organization relation. |
| Search | Lightweight/current library | Full search/archive search | Desktop-only or Desktop-primary | Chrome should stay performant. |
| Bulk operations | Avoid or very limited | Full owner | Desktop-only unless separately approved | Bulk mutation is high blast-radius. |
| Conflict review | Status only | Full owner | Desktop-only | Needs space, diagnostics, and explicit operator decisions. |
| Backup/restore | Basic status/export availability | Full owner | Desktop-only for full workflow | Restore is high-risk and filesystem-heavy. |
| Sync status | Basic readable state | Full diagnostics | Must be visible in both; Desktop has richer detail | Users need confidence without Chrome complexity. |
| Operator diagnostics | Minimal redacted diagnostics | Full diagnostics | Desktop-primary | Advanced debugging belongs in the professional workspace. |
| WebDAV setup | Not now | Future setup/diagnostics owner | Deferred | WebDAV is a transport adapter, not current product surface. |

## Sync Data Contract

| Data Class | Contract |
|---|---|
| Folder create/rename/color | Must sync both ways. |
| Basic folder identity and display metadata | Must sync both ways. |
| Chat-folder bindings | Must sync both ways after lifecycle contract is stable. |
| Captured/saved chat records | Must sync both ways where records are Studio-owned. |
| Tags/categories | Desktop-primary but visible in Chrome; Chrome write scope requires explicit contract. |
| Sync status and blockers | Visible in Chrome and Desktop; Desktop has full detail. |
| Heavy archive/search indexes | Desktop-only or Desktop-primary. |
| Backup/restore state | Desktop-only. |
| Permission grants and browser handles | Chrome-local only. |
| Desktop filesystem paths and SQLite internals | Desktop-only. |
| Delete/tombstone propagation | Deferred/high-risk. |
| WebDAV/cloud/relay transport state | Deferred until adapter design is approved. |

## Consequences

Chrome stays browser-suitable:

- smaller surface area
- less flicker risk
- fewer MV3 permission and lifecycle problems
- faster capture and basic organization workflows

Desktop has clear premium/full-workspace value:

- professional archive workflows
- richer diagnostics
- safer destructive review
- durable backup/restore
- full conflict and operator tooling

This avoids trying to make Chrome equal Desktop. Chrome remains useful and fast without inheriting every professional workspace responsibility.

## Non-Goals

This ADR does not implement:

- delete/tombstone propagation
- WebDAV transport
- public release packaging
- signing/notarization
- Billing or Identity UI
- full Desktop-equivalent Chrome workspace behavior
