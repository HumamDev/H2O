# Architecture: Ownership Map

Status: Active

Purpose:
Map cross-system ownership boundaries for H2O internal pages.

## Core Ownership
- Library Core owns shared registries, route parsing/dispatch, page-host coordination, and shell infrastructure.
- Core does not own feature data.

## Library Ownership
- Library Workspace owns the Library dashboard shell, workspace tabs, search row, route shortcuts, and Library UI preferences.
- Library Index owns the normalized known-chat read model and known-chat registry.
- Library Insights owns Explorer and Analytics rendering only.

## Feature Ownership
- Folders owns folder catalog, folder pages, and folder bindings.
- Labels owns label catalog, label pages, and chat-label assignments.
- Categories owns category catalog, category pages, category appearance, and category popups.
- Tags owns tag catalog, tag pool creation, tag suggestions, tag usage, and tag popups.
- Projects owns project catalog and project pages.

## Cross-System Rule
- A module may read another module through public owner/service APIs or documented events.
- A module must not write another module's storage or mutate another module's DOM-owned surface directly.
