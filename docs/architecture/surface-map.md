# Architecture: Surface Map

Status: Active

Purpose:
Map visible H2O surfaces and host-page side effects.

## H2O Internal Pages
- Library Dashboard, Explorer, Analytics, Recents, Saved, Organize, Categories, Tags, Folders, Labels, Projects, and their detail pages are H2O internal pages.
- H2O internal pages must own their browser tab title while active.
- H2O internal pages must suppress chat-only MiniMap UI while active.
- H2O internal pages must not rely on the previous native chat title, previous native chat minimap state, or previous native chat URL to define active surface state.

## Needs Placement Review
- `9B1a Tab Title` currently has no dedicated docs subsystem folder. Until one exists, cross-system title ownership rules live here and in `docs/systems/library/sync-rules.md`.
