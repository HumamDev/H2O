# Library Index

Status: Active

Purpose:
Define the central read model for Library chats and the ingestion rules for saved chats, native Recents, project-list sightings, and feature metadata.

## Ownership
- Library Index is the single read-model owner for known chats shown by Library Workspace, Recents, Explorer, and Analytics.
- Library Index may ingest sightings from multiple sources, normalize them, and merge them into the known-chat registry.
- Rendering layers consume Library Index via public APIs such as `getModel`, `listChats`, `getFacets`, `getStats`, and source-status helpers.

## Source Ingestion Rules
- Archive/saved chat rows are high-confidence saved sources.
- Native ChatGPT Recents may be ingested from loaded sidebar DOM and conversation-history cache.
- Sidebar Recents scrolling is a valid discovery event; newly loaded Recents rows must be scanned, registered, flushed, and reflected through the Library Index update event.
- Project-list chat rows discovered in the native Projects sidebar are source sightings with source `projects`; they may carry `projectId`, `projectName`, and `nativeProjectHref`.
- Project-list sightings must feed Library Index and the known-chat registry before Explorer sees them. Explorer must not own project scanning.
- Feature metadata from Folders, Labels, Categories, Tags, and Projects is enrichment data. The feature owner remains the authority for its catalog.

## Merge Invariants
- A known chat is keyed by normalized chat id when available, then href, then stable fallback id.
- Source lists are merged by source rank without losing lower-ranked evidence.
- Recents rows set `isRecent`; project sightings set source `projects` and may enrich project fields.
- Project metadata from ChatGPT cache fields such as `gizmo_id` is accepted as project identity evidence when available.
- Scan-batch durability fields are authoritative only when a row carries current scan context.

## Diagnostics
- Source status must expose native Recents scan status and native project-chat scan status separately.
- Diagnostics may report counts, skipped reasons, last scan reason, and last register/flush timing.
- Diagnostics must not become a second data source; they describe ingestion health only.
