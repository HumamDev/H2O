# Studio Desktop Layout Handoff Report

Use this report when continuing Studio Desktop work in another chat. Treat `src-surfaces-base/studio/STUDIO_DESKTOP_LAYOUT_CONTRACT.md` as the authoritative layout contract.

## Mandatory Instruction For The Next Chat

Do not change the Studio Desktop interface structure unless the user explicitly approves each structural step. Before editing layout/chrome/ribbon/sidebar code, state the exact routes, files, selectors/functions, expected geometry effect, and validation plan. Do not use broad layout rewrites or quick visual patches.

Protected areas:

- Desktop/Tauri titlebar and macOS traffic-light safe area.
- `.wbTauriDesktopChrome`, `.wbTauriDragStrip`, `#studioRibbon`.
- `.wbShell`, `.wbStage`, `.wbTop`, `.wbMain`.
- `.wbSide--sidebar`, `.wbRail`, sidebar logo/title row, Library row, sidebar scroll root.
- Library, Settings, saved-chat list, folders, and reader/chat route top spacing.
- Desktop CSS view zoom behavior.

Run this guard before calling any future Desktop layout change complete:

```sh
node tools/validation/studio/validate-studio-desktop-layout-contract.mjs
```

## Final Layout Model

- `.wbShell` starts at the top of the Desktop window and owns the full app height.
- There is no normal-flow titlebar row above `.wbShell`.
- The top safe area is real space inside the app compartments:
  - sidebar/rail reserve it inside `.wbSide--sidebar` / `.wbRail`;
  - right pane reserves it inside `.wbStage`;
  - the vertical divider is continuous from top to bottom.
- `.wbTauriDesktopChrome` is fixed, transparent, pointer-events none, and overlays the top safe area only.
- `.wbTauriDragStrip` supplies the invisible draggable zone.
- Ribbon menu strips overlay the top safe area. Showing or hiding a ribbon menu must not move the sidebar, right pane, title topbar, content, or divider.
- Expanding a visible ribbon body is different from showing the menu strip: the body height must be measured and reserved as real layout height so sidebar and right-pane content move down together.
- When ribbon is hidden, the underlying sidebar and right-pane backgrounds remain seamless. No glass strip, fake patch, or separate divider is allowed.

## Route Rules

- Reader/chat transcript routes are the only routes that show the reader title topbar.
- Library pages, Settings, saved-chat list pages, folders pages, migration pages, and other non-reader pages must not show the reader title topbar.
- Library-owned routes include the Library dashboard/explorer/recents/saved/link/organize pages plus saved-chat list and folders pages.
- Settings uses the same top-safe structural space as Library but has no title topbar and no ribbon menu.
- Entering Settings must clear stale Library or reader ribbon UI.
- Chrome/MV3 Studio must not receive Tauri titlebar or app-region layout rules.

## Sidebar Rules

- The sidebar logo/title row has one fixed position across all pages and states.
- The Library row below it is fixed with the top section.
- Only sections below the fixed top area scroll.
- Sidebar scrolling must never put content under the macOS traffic-light buttons.
- Expanded and collapsed sidebar states must preserve the same top alignment.
- The sidebar background and right border must be painted by the sidebar/rail itself from the top of the window, not by a patched overlay.

## Buttons And Ribbon Rules

- Library action buttons are ordered right-to-left as: appearance, ribbon toggle, refresh.
- Reader/chat title topbar uses the same visual button family and can include refresh, ribbon toggle, and appearance buttons.
- Ribbon toggle means show/hide the ribbon menu strip. It is not the old ribbon collapse behavior.
- The arrow inside the ribbon menu expands/collapses the ribbon body. Expanded ribbon body must push content down; it must not behave like a dropdown over the page.
- Library ribbon is intentionally different from reader/chat ribbon: Library shows the Library Home tab and Library actions, while chat routes show the reader/chat tabs.
- Buttons and controls near the top safe area must be `no-drag`; empty ribbon/top safe whitespace can remain draggable.

## Scroll And Width Rules

- Library, folders, saved-chat list, and Settings pages should scroll at the right pane/window edge, not with an internal list scrollbar beside content.
- Saved-chat list content should start near the top of its page, not vertically centered.
- Library content should have a suitable max width and not expand indefinitely as the window grows.
- Desktop CSS view zoom must keep body and `.wbShell` sized with `--h2o-desktop-view-zoom-inverse`, otherwise the sidebar can visually stop before the bottom of the window.

## Specific Fixes Already Made In This Thread

- macOS overlay titlebar kept native traffic lights visible with hidden native title text.
- Added a Desktop-only invisible drag area and protected interactive controls with no-drag behavior.
- Reworked Desktop ribbon placement so menu tabs live in the top safe area with the traffic-light row and overlay the app compartments.
- Fixed hidden ribbon behavior so it does not push or pull layout.
- Fixed Library and Settings to not show the reader title topbar.
- Fixed Settings and Library top-safe behavior so the sidebar and right pane own their top empty space.
- Fixed sidebar logo/title position so it remains stable across Library, Settings, saved lists, folders, and reader/chat routes.
- Fixed sidebar scroll so the logo/title row and Library row stay fixed while lower sections scroll.
- Changed sidebar recents to recent saved chats only, renamed the section to Recents, and made it collapsible.
- Added Settings Interface controls for sidebar section visibility and removed hide controls for always-on Library/Settings entries.
- Moved appearance controls into top action areas instead of a floating page-only button.
- Fixed Library ribbon tab set so only the Library Home tab is available for Library context.
- Fixed expanded ribbon-body behavior so it reserves layout height instead of dropping over page content.
- Fixed saved-chat list route vertical centering.
- Moved relevant page scrollbars toward the right edge rather than inside content.
- Added Desktop view zoom support and fixed CSS zoom compensation so the sidebar reaches the bottom.
- Corrected leaked HTML comment text that appeared at the bottom of the app.

## Current Source Markers

- `src-surfaces-base/studio/studio.html` uses `@version 2.5.46`.
- `src-surfaces-base/studio/studio.html` links `studio.css?v=2.5.46`.
- `src-surfaces-base/studio/studio.html` loads `studio.js?v=2.5.80`.
- `src-surfaces-base/studio/studio.html` loads `platform.tauri.js?v=2.5.37`.

If runtime still shows older behavior, rebuild/sync and hard reload Desktop:

```sh
npm run dev:all
SKIP_STALENESS_CHECK=1 node apps/studio/desktop/build-tools/prepare-dist.mjs
npm run dev:check
```

## Required Validation Before Future Closeout

Minimum static validation:

```sh
node tools/validation/studio/validate-studio-desktop-layout-contract.mjs
git diff --check
git diff --cached --check
```

Runtime validation should cover:

- Library with ribbon hidden and shown.
- Settings after navigating from Library with ribbon shown and hidden.
- Reader/chat transcript with ribbon hidden and shown.
- Sidebar expanded and collapsed.
- Desktop zoom changed with Cmd +/-.
- Chrome/MV3 Studio, to confirm Tauri-only rules did not leak.

## Files To Inspect Before Any Future Layout Edit

- `src-surfaces-base/studio/STUDIO_DESKTOP_LAYOUT_CONTRACT.md`
- `src-surfaces-base/studio/studio.css`
- `src-surfaces-base/studio/studio.html`
- `src-surfaces-base/studio/studio.js`
- `src-surfaces-base/studio/platform/platform.tauri.js`
- `src-surfaces-base/studio/S0Y1a. 🎬 Studio Ribbon - Studio.js`
- `src-surfaces-base/studio/S0Z1f. 🎬 Library Sidebar Tab - Studio.js`
- `src-surfaces-base/studio/S0F1d. 🎬 Library Insights - Studio.js`
- `src-surfaces-base/studio/ribbon/ribbon-shell.studio.js`

Never stage with `git add .` for this work. Use explicit files and preserve unrelated WIP.
