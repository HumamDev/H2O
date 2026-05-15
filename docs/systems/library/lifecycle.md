# Library Lifecycle

Status: Active

Purpose:
Define boot, mount, remount, route, and teardown rules for Library surfaces.

## Boot
- Library Core must boot before Library Workspace, Library Index, and feature owners that depend on Core route/page-host services.
- Library Workspace must register owner, service, page, and route handlers idempotently.
- Library Index must bind refresh listeners once and debounce refresh-heavy sources.

## Mount
- Library Workspace opens through the shared PageHost service when available.
- Feature-owned list/detail pages open through their own registered route handlers.
- Opening Library from a chat or from another H2O page must use the same route dispatch path.

## Route Remount
- Direct URLs such as `/?h2o_flsc=1&h2o_flsc_view=categories` must remount the correct H2O surface after reload.
- Browser back/forward must parse H2O routes and dispatch to the registered owner instead of relying on existing DOM state.
- Leaving H2O internal routes must clear H2O page ownership and allow native ChatGPT page behavior to resume.

## Timers And Observers
- Sidebar Recents and Projects scans must attach observers/listeners once and remove or replace stale listeners when roots change.
- Scans caused by scroll or mutation must be debounced.
- Title reapply loops, route retries, scan timers, and mutation observers must stop forcing H2O state after leaving H2O pages.
