# Architecture: Lifecycle Map

Status: Active

Purpose:
Map H2O internal page lifecycle responsibilities.

## Boot Order
- Core services boot before feature owners that depend on them.
- Feature owners register owners, services, pages, and routes idempotently.
- Source scanners bind observers and listeners once.

## Page Lifecycle
- Opening an H2O route dispatches to the registered feature owner.
- Mounting a new H2O page uses PageHost to manage existing hosted surfaces.
- Leaving H2O routes restores native ChatGPT page behavior.

## Cleanup
- Observers, scroll listeners, scan timers, title-reapply timers, and route retries must not keep forcing H2O behavior after the active route leaves H2O.
- Browser back/forward must not depend on old mounted DOM nodes.
