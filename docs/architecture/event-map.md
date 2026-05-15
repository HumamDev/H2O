# Architecture: Event Map

Status: Active

Purpose:
Map event-driven synchronization between H2O systems.

## Library Events
- Library Index emits `evt:h2o:library-index:updated` after rebuilding the known-chat model.
- Library Workspace emits `evt:h2o:library-workspace:open` when the Library surface opens.
- Library Workspace emits `evt:h2o:library-workspace:sidebar-layout-changed` after sidebar layout updates.

## Refresh Hints Into Library Index
- Labels, Tags, Folders, Projects, Core Index, Chat Registry, storage, focus, popstate, and hashchange events may request Library Index refresh.
- Refresh-hint consumers must debounce and carry a reason.
- Event source guards must prevent self-triggered refresh loops.

## Cross-System Rule
- Events announce state changes; they do not transfer ownership.
- Receiving an event from another subsystem does not authorize direct writes into that subsystem's storage.
