# ADR-0004: Library Index Source Model

Status: Accepted

Date: 2026-05-10

## Context
Library needs to show Recents, Explorer, Analytics, and feature-linked chat evidence from multiple places: saved/archive rows, native ChatGPT Recents, native project lists, labels, folders, categories, tags, and project metadata. A separate database for every Library page or subsection would duplicate ownership and make routing/state harder to reason about.

## Decision
Use the existing Library Index and Library Store registry as the central source model for known chats. Library Workspace owns navigation and UI state. Explorer and Analytics consume Library Index. Native Recents and native Projects sidebar rows are treated as source sightings that flow into Library Index, not as UI-owned data.

## Consequences
- No special database is needed for Library workspace tabs, Recents, Explorer source pooling, or route views.
- Route state remains in URL/history via Core route services.
- Feature catalogs remain owned by their feature modules.
- Library Index becomes the enforcement point for source merge rules, diagnostics, durability, and normalized chat evidence.

## Validation
- Explorer must include saved/archive rows, Recents sightings, and project-list sightings through Library Index.
- Recents scrolling must update Library Index when new native rows load.
- Project-list scans must register rows through Library Index before Explorer can display them.
- Runtime changes must not make Explorer, Analytics, or Library Workspace directly own source scanning or feature storage.
