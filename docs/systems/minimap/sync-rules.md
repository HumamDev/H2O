# MiniMap Sync Rules

Status: Active

Purpose:
Define when MiniMap may synchronize with the current page.

## Sync Direction
- Native chat page state may drive MiniMap page counts and navigation.
- MiniMap must not drive H2O Library, Categories, Folders, Labels, Projects, or other internal page state.
- Chat-to-MiniMap sync is one-way unless a MiniMap control explicitly navigates a chat turn through the approved chat navigation path.

## H2O Internal Pages
- H2O internal pages are not chat pages and must suppress chat-only MiniMap controls.
- URLs with `h2o_flsc=1` and any active H2O page-host surface make MiniMap ineligible.
- Moving from a native chat to an H2O internal page must hide MiniMap even if native ChatGPT still retains the previous chat URL or title.

## Validation
- Verify MiniMap is visible or eligible on native chat pages.
- Verify MiniMap is hidden on Library Dashboard, Categories, Tags, Folders, Labels, Projects, and detail pages.
- Verify returning from an H2O page to a native chat allows native MiniMap behavior to resume.
