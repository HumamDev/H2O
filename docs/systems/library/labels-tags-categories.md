# Library Labels, Tags and Categories

Status: Active

Purpose:
Define durable rules for Library labels, tags, categories, and their cross-links.

Sync architecture / convergence design:
See `../cross-platform/f15.0.0-labels-categories-tags-canonical-object-model.md`
for the F15 canonical object model, lifecycle, privacy policy, and execute-lane
integration plan. This doc remains the product-feature behavior source of truth;
the F15.0.0 doc is the sync-architecture source of truth.

## Ownership
- Labels owns label catalog and chat-label assignments.
- Tags owns tag catalog, tag pool creation, suggestion pool state, tag usage metadata, and tag popups.
- Categories owns category catalog, category list/detail pages, category appearance, and category popups.
- Library Workspace and Library Index may read category/tag summaries through public APIs; they must not write category or tag storage directly.

## Category Catalog Invariants
- Every category created in the category store must be visible on the Categories page.
- The category dropdown used for linking tags must read from the same category source as the Categories page.
- A category with zero chats or zero linked tags is still a valid category and must remain visible.

## Tag Catalog Invariants
- The Tags page must provide a way to create tags and add them to the tag pool.
- Tag creation from category popups is allowed only through the Tags API or another documented Tags-owned facade.
- A tag can be linked to multiple categories.
- A category can be linked to multiple tags.

## Category-Tag Display Rules
- Category rows may show bubbles for tags connected to that category.
- If row space is insufficient, visible tag bubbles should prefer recently used tags.
- Hidden overflow must not delete or unlink tags; it is display-only.

## Popup Rules
- Tag popups may offer category linking through a category dropdown.
- Category popups may offer tag linking or tag creation through Tags-owned APIs.
- Popup positioning must clamp to the viewport so the popup does not disappear outside the browser frame.
