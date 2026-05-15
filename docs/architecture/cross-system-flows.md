# Architecture: Cross-System Flows

Status: Active

Purpose:
Document durable cross-system flows discovered from Library page, Recents, Projects, Categories, Tags, title, and MiniMap work.

## Library Route Flow
- User action or URL change -> Core route parse -> owner route handler -> PageHost mount -> active H2O page title/surface sync.

## Explorer Source Flow
- Native Recents/sidebar/cache sightings -> Library Index normalization -> known-chat registry -> Explorer/Analytics rendering.
- Native Projects sidebar chat sightings -> Library Index normalization -> known-chat registry -> Explorer/Analytics rendering.

## Category-Tag Flow
- Tags/Categories storage -> category/tag public APIs -> dropdowns, tag bubbles, and popups.
- UI overflow rules affect display only and must not mutate links.

## Chat Surface Flow
- Native chat active -> MiniMap eligible and native ChatGPT title eligible.
- H2O internal page active -> MiniMap suppressed and H2O title owner active.
