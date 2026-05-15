# Library Events

Status: Active

Purpose:
Define Library event direction and payload expectations.

## Emitted Events
- `evt:h2o:library-index:updated` is emitted after Library Index refreshes its model.
- `evt:h2o:library-index:updated` payload must include at least `reason`, `counts`, `builtAt`, and `durationMs` when available.
- `evt:h2o:library-workspace:open` is emitted when the Library Workspace surface opens.
- `evt:h2o:library-workspace:sidebar-layout-changed` is emitted after Library sidebar layout visibility/order changes.

## Consumed Events
- Library Index listens to labels, tags, folders, projects, core-index, chat-registry, storage, focus, popstate, and hashchange events as refresh hints.
- `evt:h2o:projects:changed` and `evt:h2o:projects:refreshed` are refresh hints only. Projects remains the owner of project rows.
- Chat Registry change events are consumed with loop guards. Events sourced from `library-index` must not trigger a self-refresh loop.
- Recents-sourced Chat Registry events may be ignored while a refresh is already in flight because the producing scan will schedule the refresh.

## Event Rules
- Event names must be constants in runtime modules.
- Event payloads should carry reasons for diagnostics and reproducibility.
- Consumers must debounce refresh-heavy events.
- Events are preferred over direct cross-module state mutation.
- Legacy or mirror events may be bridged only inside compatibility layers.
