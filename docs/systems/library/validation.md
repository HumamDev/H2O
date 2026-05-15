# Library Validation

Status: Active

Purpose:
Define checks required after changing Library contracts, routes, tabs, source ingestion, and related surfaces.

## Static Checks
- Run `node --check` for every changed userscript.
- Run `git diff --check`.
- Run the relevant dev build, normally `npm run dev:all` for extension script changes.
- Confirm no runtime code changed when the task is documentation-only.

## Library Workspace Checks
- Verify second-row tabs render in order: `Dashboard`, `Analytics`, `Explorer`, `Recents`, `Saved`, `Organize`.
- Verify old stored tab key `recent` opens the canonical `Recents` tab.
- Verify first-row route shortcuts open feature-owned list pages for Folders, Labels, Categories, and Projects.
- Verify Library-to-feature and feature-to-Library navigation works from existing Library pages, not only from native chats.

## Library Index Checks
- Verify scrolling native Recents increases or refreshes Library Index known-chat rows when new sidebar rows load.
- Verify project-list chat rows discovered from the native Projects sidebar appear in Explorer through Library Index.
- Verify Explorer and Analytics still work when Library Insights is loaded but do not scan DOM themselves.
- Verify source diagnostics expose native Recents and native project-chat scan status separately.

## Surface Checks
- Verify H2O internal pages suppress chat-only MiniMap controls.
- Verify document title is owned by H2O while an H2O internal page is active and returns to native ChatGPT behavior when leaving H2O pages.
- Verify route URLs for Library, Categories, Folders, Labels, and Projects are distinct and reloadable.
