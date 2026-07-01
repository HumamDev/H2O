# OPERATIONAL.4 SIX-TYPE REQUEST READINESS CLOSURE - CLOSED; productSyncReady:false

## Scope and status

Operational.4 closes the six-type single-canonical request readiness slice under the
current v1 model.

- Applied request set is now exactly six:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`
  - `chat-label-unbind`
  - `chat-tag-unbind`
- Category symmetry was already closed via `assign`/`clear`.
- Label/tag symmetry is now closed via bind/unbind.
- Catalog CRUD remains deferred.
- Hard-delete/un-delete remains in the sync deletion lane.
- `productSyncReady` remains `false` until a separate flip gate.
- `fullBundle.v3` remains unminted.
- WebDAV apply remains deferred.
- Multi-writer remains deferred.
- `tags.updated_at` remains deferred to a future multi-writer slice.

## Record Operational.2

- Added runtime support for `chat-label-unbind` and `chat-tag-unbind`.
- Desktop canonical apply now validates chat + label/tag existence.
- Each unbind applies by removing only the relevant `label_bindings` or
  `tag_bindings` row.
- Already-unbound requests return `noop`.
- Basis is carried diagnostically and remains inert under v1 single-canonical behavior.
- Chrome and mirror shapers accept unbind requests in request-only mode.
- Diagnostics no longer classify label/tag unbind as deferred destructive shapes.

## Record Operational.3

- Added deterministic in-memory SQLite harness proving both bind/unbind symmetry
  and request behaviors for the six-type slice.
- Harness coverage includes:
  - bind/unbind symmetry
  - exact binding-row deltas
  - noop for already-unbound
  - requestId dedupe
  - invalid chat/entity rejection
  - canonical receipt-order behavior
  - inert basis handling
  - stable projection hash behavior
- Catalog tables are untouched by bind/unbind operations.
- No `productSyncReady` flip in this slice.
- No `fullBundle.v3` mint.
- No WebDAV apply.
- No catalog CRUD.
- No multi-writer behavior.

## Closure criteria status

- Six-type single-canonical request readiness is closed.
- Remaining product flip remains explicitly deferred.
- The slice stays within docs/evidence-only scope.
- No runtime code or validator implementation changes are introduced in this closure note.
