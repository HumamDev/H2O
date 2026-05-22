# Multi-Peer Readiness F5 - Tombstone Delete Model

F5A/F5B is documentation-only. It audits current Studio Library delete paths
and defines the tombstone schema and delete policy needed before any future
multi-peer delete propagation.

F5 does not add storage, migrations, export fields, import behavior, conflict
queues, UI, WebDAV/mobile work, or bidirectional sync. The R-phase root sync
contract remains unchanged: Desktop writes `~/H2O Studio Sync/latest.json`, and
Chrome continues to read the root `latest.json` path.

## Principles

- Absence must not mean delete.
- Remote tombstones must not be applied automatically.
- Delete-vs-edit conflicts must never silently destroy newer edits.
- Tombstones are explicit durable delete records, not inferred gaps.
- Linked-only chat records and saved snapshot records require different safety
  policies.
- Folder, tag, label, category, and project deletes must not silently destroy
  chats or saved content.
- Hard purge is deferred until peer watermarks, retention policy, and conflict
  diagnostics exist.

## F5A Delete Behavior Audit

Inspected paths:

- `apps/studio/desktop/src-tauri/src/lib.rs`
- `src-surfaces-base/studio/store/chats.tauri.js`
- `src-surfaces-base/studio/store/snapshots.tauri.js`
- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/store/tags.tauri.js`
- `src-surfaces-base/studio/store/labels.tauri.js`
- `src-surfaces-base/studio/store/categories.tauri.js`
- `src-surfaces-base/studio/store/highlights.js`
- `src-surfaces-base/studio/store/prefs.js`
- `src-surfaces-base/studio/studio.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
- `src-surfaces-base/studio/sync/multi-peer-diff.js`

### Schema observations

Desktop SQLite uses soft foreign-key conventions only. The schema has no SQL
foreign-key constraints, so delete consistency is enforced by JS store modules:

- `chats` has `is_deleted`, `is_saved`, `is_linked`, `folder_id`,
  `category_id`, and `project_id`.
- `folders`, `labels`, `tags`, and `categories` have no deleted flag.
- `folder_bindings`, `label_bindings`, and `tag_bindings` are join tables with
  no deleted flag.
- `snapshots` and `snapshot_turns` have no deleted flag.
- `snapshot_turns` are internal payload rows keyed by `snapshot_id`.
- `project_id` is currently a chat field; no local first-class project table was
  found in the Desktop SQLite schema.

### Current behavior by record kind

| Record kind | Current delete path | Current behavior | F5 risk |
| --- | --- | --- | --- |
| `chat` | `store/chats.tauri.js remove()` | Hard deletes `chats` row. `is_deleted` exists and can be patched/upserted, but `remove()` bypasses it. | Mixed soft/hard semantics; future tombstone routing must centralize chat delete. |
| `linkedOnlyChat` | Same chat row model, plus UI/archive delete path in `studio.js` | Link-only state is represented by `is_linked`; delete UI calls archive delete ops and removes cached UI row. | Must not delete saved snapshots or saved chat content when only a link record is removed. |
| `snapshot` | `store/snapshots.tauri.js remove()` | Deletes `snapshot_turns` first, then hard deletes `snapshots`. | Saved transcript content can disappear without durable tombstone. |
| `savedSnapshot` | Same snapshot table | No distinct delete safety policy in current storage. | Needs stricter policy than linked-only records. |
| `folder` | `store/folders.tauri.js remove()` | Deletes `folder_bindings` for the folder, then hard deletes `folders`. Does not delete chats. | Requires folder tombstone plus binding tombstones for future propagation. |
| `folderBinding` | `store/folders.tauri.js unbindChat()` and `bindChat()` | `unbindChat()` hard deletes one join row. `bindChat()` uses `INSERT OR REPLACE`, replacing the prior one-folder-per-chat binding. | Binding replacement currently loses prior binding intent. |
| `tag` | `store/tags.tauri.js remove()` | Deletes `tag_bindings` for the tag, then hard deletes `tags`. | Definition delete silently removes assignment rows. |
| `tagBinding` | `store/tags.tauri.js unbindChat()` and `replaceForChat()` | `unbindChat()` hard deletes one row. `replaceForChat()` deletes all tag bindings for a chat, then inserts the new set. | Full replacement makes removed bindings absence-based. |
| `label` | `store/labels.tauri.js remove()` | Deletes `label_bindings` for the label, then hard deletes `labels`. | Definition delete silently removes assignment rows. |
| `labelBinding` | `store/labels.tauri.js unbindChat()` and `replaceForChat()` | `unbindChat()` hard deletes one row. `replaceForChat()` deletes all label bindings for a chat, then inserts the new set. | Full replacement makes removed bindings absence-based. |
| `category` | `store/categories.tauri.js remove()` | Clears `chats.category_id` for assigned chats, bumps chat `updated_at`, then hard deletes `categories`. | Category assignment removal is not represented as a first-class delete. |
| `categoryAssignment` | `store/categories.tauri.js clearChat()` | Sets `chats.category_id = NULL` and bumps `updated_at`. | Assignment delete is encoded as a field clear. |
| `project` | No first-class project table/delete API found in Desktop SQLite | `project_id` exists on chats; project views appear derived from library/native metadata. | Project tombstones should be deferred until project records are first-class. |
| `visualMetadata` | `store/highlights.js removeForAnswer()` and `setForAnswer(..., [])` | Deletes an entry from the highlights map and persists the whole blob. | Only tombstone if visual metadata becomes a synced independent record. |
| `prefs` | `store/prefs.js remove()` | Removes Studio-pref keys from platform storage. | Not Library content tombstone scope unless a future pref-sync model exists. |

### Existing sync diagnostics

`multi-peer-diff.js` already reports that bundles have no `tombstones[]` array
and that deletion is currently absence-based. With local state, it can report
records present locally but absent from the bundle as tombstone candidates. It
also classifies `state.isDeleted` divergence as a hard delete-vs-edit conflict.

This is diagnostic-only. It does not create tombstones, apply deletes, or change
runtime data.

### Delete paths that need future routing

These paths should be routed through a tombstone-aware API in F5D or later:

- `store/chats.tauri.js remove()`
- `store/snapshots.tauri.js remove()`
- `store/folders.tauri.js remove()`
- `store/folders.tauri.js unbindChat()`
- `store/folders.tauri.js bindChat()` when replacing an existing binding
- `store/tags.tauri.js remove()`
- `store/tags.tauri.js unbindChat()`
- `store/tags.tauri.js replaceForChat()`
- `store/labels.tauri.js remove()`
- `store/labels.tauri.js unbindChat()`
- `store/labels.tauri.js replaceForChat()`
- `store/categories.tauri.js remove()`
- `store/categories.tauri.js clearChat()`
- `studio.js executeDeleteChat()` archive delete path
- `store/highlights.js removeForAnswer()` if highlights become sync records

## F5B Tombstone Schema

Shared tombstone record:

```js
{
  schema: 'h2o.studio.tombstone.v1',
  tombstoneId,
  recordKind,
  recordId,
  deletedAt,
  deletedBySyncPeerId,
  deleteReason,
  priorDigest,
  priorUpdatedAt,
  sourceExportId,
  sourceSequenceNumber,
  cascadeFrom,
  restoredAt,
  restoredBySyncPeerId,
  meta
}
```

Required in a local tombstone record:

- `schema`
- `tombstoneId`
- `recordKind`
- `recordId`
- `deletedAt`
- `deletedBySyncPeerId`
- `deleteReason`

Optional until later export/import:

- `priorDigest`
- `priorUpdatedAt`
- `sourceExportId`
- `sourceSequenceNumber`
- `cascadeFrom`
- `restoredAt`
- `restoredBySyncPeerId`
- `meta`

`sourceExportId` and `sourceSequenceNumber` are intentionally optional for
local-only F5C. They should become populated once tombstones are exported or
imported through a future wire model.

Suggested `deleteReason` values:

- `user-delete`
- `user-unbind`
- `user-replace`
- `cascade`
- `system-cleanup`
- `remote-proposed`
- `import-conflict`

Suggested `recordKind` values:

- `chat`
- `linkedOnlyChat`
- `snapshot`
- `savedSnapshot`
- `folder`
- `folderBinding`
- `tag`
- `tagBinding`
- `label`
- `labelBinding`
- `category`
- `categoryAssignment`
- `project`
- `visualMetadata`

## Per-Record-Kind Policy

| Kind | Tombstone? | Hard delete later? | Cascade policy | UI meaning | Restore |
| --- | --- | --- | --- | --- | --- |
| `chat` | Yes | Deferred | Tombstone bindings; do not delete saved snapshots by default. | Hide from active library. | Restore if not purged. |
| `linkedOnlyChat` | Yes | Deferred | Tombstone link/bindings only. | Remove Add-to-Library link row. | Restore link metadata if source still exists. |
| `snapshot` | Yes | Deferred | `snapshot_turns` are internal payload rows. | Hide saved snapshot. | Restore only if payload retained. |
| `savedSnapshot` | Yes | Very restricted | No silent cascade from chat delete. | Protect saved transcript content. | Review required if remote delete conflicts. |
| `folder` | Yes | Deferred | Tombstone folder bindings; never delete chats. | Remove organizational container. | Restore folder metadata and valid bindings. |
| `folderBinding` | Yes | Yes after retention | None. | Remove chat-folder assignment. | Restore if chat and folder are active. |
| `tag` | Yes | Restricted | Existing bindings require explicit binding tombstones or review. | Remove/deactivate tag definition. | Restore tag definition. |
| `tagBinding` | Yes | Yes after retention | None. | Remove tag assignment. | Restore if chat and tag are active. |
| `label` | Yes | Restricted | Existing bindings require explicit binding tombstones or review. | Remove/deactivate label definition. | Restore label definition. |
| `labelBinding` | Yes | Yes after retention | None. | Remove label assignment. | Restore if chat and label are active. |
| `category` | Yes | Restricted | Existing assignments require explicit assignment tombstones or review. | Remove/deactivate category definition. | Restore category definition. |
| `categoryAssignment` | Yes | Yes after retention | None. | Clear chat category. | Restore if chat and category are active. |
| `project` | Later | Later | TBD after first-class project storage exists. | TBD. | TBD. |
| `visualMetadata` | Conditional | Conditional | Usually owner-record dependent. | Remove visual annotation. | Restore only if owner exists. |

## Cascade Rules

- Deleting a folder must not delete chats.
- Deleting a folder may tombstone `folderBinding` records that point to it.
- Deleting a chat may tombstone folder, tag, label, and category assignment
  records.
- Deleting a chat must not silently delete saved snapshots.
- Deleting a linked-only chat must not delete saved snapshots for the same chat.
- Deleting a snapshot tombstones the snapshot; `snapshot_turns` remain internal
  payload rows unless they become independently addressable records later.
- Deleting a tag, label, or category definition must not silently remove data if
  bindings or assignments still exist. It must create explicit dependent
  tombstones or route to review.
- Parent folder/category deletes must not imply subtree delete unless the user
  explicitly selected a cascade operation and `cascadeFrom` records it.

## Delete-vs-Edit Conflict Policy

| Conflict | Required future behavior |
| --- | --- |
| Peer A deletes a record, Peer B edits it later | Create `delete-vs-edit`; do not apply delete silently. |
| Peer A deletes a folder, Peer B adds a chat to that folder | Create binding-to-deleted-parent conflict. |
| Peer A deletes a tag, label, or category, Peer B applies it | Create assignment-to-deleted-definition conflict. |
| Peer A deletes a linked-only chat, Peer B saves a snapshot | Preserve saved snapshot; route linked delete to review if needed. |
| Peer A deletes a snapshot, Peer B references it | Protect referenced snapshot; route to conflict. |
| Multiple peers delete the same record | Coalesce by `recordKind + recordId`; preserve peer/source metadata. |
| Peer A restores a record, Peer B deletes it | Resolve by source sequence/export metadata and review, not wall clock alone. |

## Restore Model

Restore must not erase the tombstone. A restore should either:

- set `restoredAt` and `restoredBySyncPeerId` on the tombstone, or
- create a future restore event linked to the tombstone.

Local restore can rehydrate the record only if the store still has enough prior
metadata or retained payload. If payload is missing, the record becomes a restore
candidate requiring a source peer or user review.

Remote restore and remote delete conflicts must be explicit. Wall-clock
`deletedAt` is not enough; future apply logic should consider source peer,
`sourceExportId`, `sourceSequenceNumber`, and local edit timestamps.

## Retention And Purge Strategy

Initial retention should be indefinite. Keeping tombstones forever is safer than
allowing old peers to resurrect deleted records through absence-based merge.

Future purge may use duration, count, and peer watermarks, but must not purge:

- unresolved conflicts,
- tombstones not observed by known peers,
- tombstones for records with retained restore candidates,
- tombstones needed to explain dependent cascade records.

Hard purge must be an explicit maintenance action outside F5A/F5B.

## Future Storage Model

Desktop should eventually add a SQLite tombstone table, not reuse ad hoc
`meta_json` flags.

Suggested table name:

- `sync_tombstones`

Suggested indexes:

- `tombstone_id`
- `record_kind, record_id`
- `deleted_at`
- `deleted_by_sync_peer_id`
- `source_export_id`
- `source_sequence_number`
- `restored_at`
- `cascade_from`

Chrome should eventually use IndexedDB for tombstones rather than
`chrome.storage`, because tombstones are durable sync records and can grow over
time. Mobile can mirror the Desktop SQLite model when mobile sync is in scope.

## F5C Local Store Scaffold

F5C adds the inert Desktop-local storage scaffold:

- SQLite table: `sync_tombstones`
- Desktop store module: `H2O.Studio.store.tombstones`
- Module file: `src-surfaces-base/studio/store/tombstones.tauri.js`

F5C keeps all existing delete behavior unchanged. No `remove`, `unbindChat`,
`replaceForChat`, `clearChat`, or archive delete path calls the tombstone store.
Tombstones are written only when `createTombstone(record)` is called directly.

The table uses `tombstone_id` as the primary key and keeps history by allowing
multiple tombstones for the same `record_kind + record_id` over time. A partial
unique index prevents duplicate active tombstones while still allowing a new
active tombstone after a previous one is marked restored:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_tombstones_active_record
  ON sync_tombstones(record_kind, record_id)
  WHERE restored_at IS NULL;
```

F5C API:

```js
H2O.Studio.store.tombstones.createTombstone(record)
H2O.Studio.store.tombstones.getTombstone(recordKind, recordId)
H2O.Studio.store.tombstones.getById(tombstoneId)
H2O.Studio.store.tombstones.listTombstones(filters)
H2O.Studio.store.tombstones.countByKind(filters)
H2O.Studio.store.tombstones.markRestored(tombstoneId, restoredBySyncPeerId)
H2O.Studio.store.tombstones.validateTombstone(record)
await H2O.Studio.store.tombstones.diagnose(options)
```

`deletedBySyncPeerId` is resolved from `H2O.Studio.identity.whenReady()` unless
the caller supplies it. If identity is unavailable, direct tombstone creation
fails clearly. `sourceExportId` and `sourceSequenceNumber` remain optional in
F5C because tombstones are not exported or imported yet.

`markRestored()` only sets `restored_at`, `restored_by_sync_peer_id`, and
`updated_at`; it never deletes the tombstone row. `diagnose()` is content-free
and redacts peer IDs by default.

## F5D Local Folder-Binding Unbind Routing

F5D is the first local delete-routing step. It routes only successful explicit
Desktop folder-binding unbinds through the tombstone store:

```js
H2O.Studio.store.folders.unbindChat(folderId, chatId)
```

F5D does not route folder deletion cascades, `bindChat()` replacement,
tags, labels, categories, chats, snapshots, archive deletes, UI delete flows,
export, import, remote apply, conflict queues, purge, or bidirectional sync.

When `unbindChat(folderId, chatId)` deletes one existing `folder_bindings` row,
it attempts a best-effort tombstone:

```js
{
  recordKind: 'folderBinding',
  recordId: `folderBinding:${encodeURIComponent(chatId)}:${encodeURIComponent(folderId)}`,
  deleteReason: 'user-unbind',
  meta: {
    chatId,
    folderId,
    recordIdFormat: 'folderBinding:${encodeURIComponent(chatId)}:${encodeURIComponent(folderId)}',
    source: 'store.folders.unbindChat'
  }
}
```

The SQL delete remains the source of truth. If no binding row is deleted,
`unbindChat()` returns `false` as before and no tombstone is created. If the
SQL delete succeeds but the tombstone write fails because of a duplicate active
tombstone, unavailable tombstone store, missing identity, or another local
storage error, `unbindChat()` still returns `true` and records a warning in the
folders store diagnostics.

## F5D.1 Local Folder-Binding Replacement Routing

F5D.1 extends only the local Desktop folder-binding move path:

```js
H2O.Studio.store.folders.bindChat(newFolderId, chatId)
```

Desktop currently stores one folder binding per chat. `bindChat()` uses
`INSERT OR REPLACE`, so moving a chat from folder A to folder B removes the old
folder A binding by replacement. F5D.1 creates a best-effort tombstone for that
old binding only when all of these are true:

- a previous binding exists for the chat,
- the previous `folder_id` differs from the new `folderId`,
- the new bind succeeds.

No tombstone is created for the first bind, for rebinding to the same folder, or
when the SQL bind fails.

Replacement tombstones use this shape:

```js
{
  recordKind: 'folderBinding',
  recordId: `folderBinding:${encodeURIComponent(chatId)}:${encodeURIComponent(oldFolderId)}`,
  deleteReason: 'folder-rebind',
  meta: {
    chatId,
    folderId: oldFolderId,
    oldFolderId,
    newFolderId,
    assignedAt,
    recordIdFormat: 'folderBinding:${encodeURIComponent(chatId)}:${encodeURIComponent(folderId)}',
    source: 'store.folders.bindChat',
    replacement: true
  }
}
```

The bind remains the source of truth. Tombstone creation runs only after the new
binding succeeds, and tombstone failures never break a successful bind. Duplicate
active tombstones, unavailable tombstone store, missing identity, or local
storage errors are reported as folders diagnostics warnings only.

F5D.1 still does not route folder deletion cascades, explicit unbinds beyond the
existing F5D behavior, tags, labels, categories, chats, snapshots, archive
deletes, UI delete flows, export, import, remote apply, conflict queues, purge,
or bidirectional sync.

## F5D.2 Local Folder Delete Cascade Routing

F5D.2 extends only the local Desktop folder deletion path:

```js
H2O.Studio.store.folders.remove(folderId)
```

Desktop deletes `folder_bindings` for the folder first, then deletes the
`folders` row. The folder-row delete remains the authoritative success signal.
F5D.2 pre-reads the folder row and affected bindings, preserves the existing SQL
delete order, and creates best-effort tombstones only after the folder row delete
succeeds.

F5D.2 creates one folder tombstone:

```js
{
  recordKind: 'folder',
  recordId: `folder:${encodeURIComponent(folderId)}`,
  deleteReason: 'folder-delete',
  meta: {
    folderId,
    source: 'store.folders.remove',
    cascade: true,
    bindingCount,
    parentId,
    createdAt,
    updatedAt,
    folderNamePresent: true
  }
}
```

The folder name is intentionally not stored in tombstone metadata. The boolean
`folderNamePresent` is enough for diagnostics without leaking user-visible
folder labels.

F5D.2 also creates one folder-binding tombstone for each pre-read binding removed
by the folder delete:

```js
{
  recordKind: 'folderBinding',
  recordId: `folderBinding:${encodeURIComponent(chatId)}:${encodeURIComponent(folderId)}`,
  deleteReason: 'folder-delete-cascade',
  cascadeFrom: `folder:${encodeURIComponent(folderId)}`,
  meta: {
    chatId,
    folderId,
    assignedAt,
    source: 'store.folders.remove',
    cascade: true,
    cascadeKind: 'folder-delete',
    recordIdFormat: 'folderBinding:${encodeURIComponent(chatId)}:${encodeURIComponent(folderId)}'
  }
}
```

If the folder does not exist or the folder-row delete fails, no tombstones are
created. If pre-reading bindings fails, the folder delete still proceeds; a
successful folder delete creates only the folder tombstone and records a warning
that cascade binding tombstones were skipped. Tombstone failures, duplicate
active tombstones, unavailable tombstone store, or missing identity never break a
successful folder delete and are reported through folders diagnostics warnings.

F5D.2 does not tombstone child folders, reparent children, delete chats, delete
snapshots, route tag/label/category deletes, route archive/UI delete flows,
export tombstones, import tombstones, apply remote tombstones, create a conflict
queue, add UI, purge, or enable bidirectional sync.

## F5E.0 Tombstone Export Preview

F5E.0 adds a read-only Desktop developer API for previewing the tombstones that
would later be eligible for bundle export:

```js
await H2O.Studio.store.tombstones.previewExport({
  includeRestored: true,
  includeSensitive: true,
  limit: 5000
})
```

F5E.0 does not add `tombstones` to `h2o.studio.fullBundle.v2`, does not modify
`latest.json`, does not change `exportLatestSyncBundle()`, and does not change
any importer. It is a local read-only preview over `sync_tombstones`.

The preview report shape is:

```js
{
  schema: 'h2o.studio.tombstone-export-preview.v1',
  tombstoneSchemaVersion: 'h2o.studio.tombstone.v1',
  generatedAt,
  redacted: false,
  includeRestored: true,
  limit: 5000,
  total,
  active,
  restored,
  skipped,
  byKind,
  warnings: [],
  tombstones: []
}
```

Each preview tombstone preserves stored provenance fields as-is. F5E.0 does not
overlay a current `exportId`, does not assign a current `sourceSequenceNumber`,
and does not mutate local tombstone rows.

Rows with invalid `meta_json` are previewed with `meta: {}` and a warning. Rows
that fail required tombstone validation are skipped with a warning. Synthetic or
test tombstones are not filtered by ID or reason; the preview reflects local
store contents.

The default preview includes active and restored tombstones. Passing
`includeRestored: false` previews active tombstones only. Passing
`includeSensitive: false` redacts peer IDs in the preview output, but record IDs
remain present because they are the tombstone identity keys.

## F5E.1 Read-Only Tombstones In Exported Bundle

F5E.1 adds local tombstones to the Desktop full-bundle export as read-only wire
payload:

```js
{
  schema: 'h2o.studio.fullBundle.v2',
  exportSchemaVersion: 'h2o.studio.export-envelope.v1',
  tombstoneSchemaVersion: 'h2o.studio.tombstone.v1',
  tombstones: []
}
```

`exportFullBundle()` calls `H2O.Studio.store.tombstones.previewExport()` with:

```js
{
  includeRestored: true,
  includeSensitive: true,
  limit: 5000
}
```

`exportLatestSyncBundle()` inherits the same bundle through `exportFullBundle()`.
No tombstone rows are mutated during export. Stored `sourceExportId` and
`sourceSequenceNumber` values are preserved as-is; F5E.1 does not overlay the
current export event onto tombstone rows.

The exporter always includes `tombstoneSchemaVersion` and `tombstones: []`. If
the tombstone preview API is unavailable, throws, or returns malformed data, the
root export still succeeds with an empty tombstone array and diagnostics under:

```js
diagnostics.desktopExport.tombstones
```

That diagnostics block includes:

```js
{
  supported: true,
  exported,
  schema: 'h2o.studio.tombstone.v1',
  total,
  active,
  restored,
  skipped,
  byKind,
  warnings
}
```

F5E.1 does not change any importer. Chrome and Desktop import paths may ignore
the top-level `tombstones` array. Tombstones are included before F3
`contentSha256` calculation, so exported checksums cover the tombstone payload.
F5E.1 does not apply tombstones, propagate deletes, add a conflict queue, add UI,
purge, restore, write Chrome data, or enable bidirectional sync.

## F5E.2a Tombstone Payload Diagnostics

F5E.2a extends the pure `multi-peer-diff.js` analyzer with a top-level
`report.tombstones` section. This is diagnostic-only. It does not change bundle
export, import, delete routing, UI, conflict handling, or Chrome sync behavior.

The analyzer preserves `report.envelope.hasTombstoneArray` and adds aggregate
payload health:

```js
{
  tombstones: {
    supported: true,
    hasTombstoneArray: true,
    tombstoneSchemaVersion: 'h2o.studio.tombstone.v1',
    total,
    active,
    restored,
    byKind,
    byDeleteReason,
    cascadeCount,
    cascadeByKind,
    cascadeRootCount,
    cascadeChildCount,
    cascadeMissingParentRefCount,
    malformedCount,
    missingRequiredFields: {
      schema,
      tombstoneId,
      recordKind,
      recordId,
      deletedAt,
      deletedBySyncPeerId,
      deleteReason
    },
    wrongSchemaCount,
    unknownRecordKindCount,
    metaPresentCount,
    metaObjectCount,
    metaMalformedCount,
    inconsistentRestoreCount,
    warnings
  }
}
```

If `tombstones` is absent, diagnostics report `supported: false`,
`hasTombstoneArray: false`, `total: 0`, and a
`missing-tombstone-array` warning. If `tombstones` exists but is not an array,
diagnostics report `supported: false`, `hasTombstoneArray: false`,
`malformedCount: 1`, and a `tombstones-not-array` warning.

Required tombstone fields are `schema`, `tombstoneId`, `recordKind`, `recordId`,
`deletedAt`, `deletedBySyncPeerId`, and `deleteReason`. Missing required fields
are counted by field name only. `malformedCount` counts each malformed row once,
even if that row has multiple missing fields.

Restored tombstones are counted when either `restoredAt` or
`restoredBySyncPeerId` is present. If only one restore field is present, the row
still counts as restored and increments `inconsistentRestoreCount`.

Cascade-related tombstones are counted when `cascadeFrom` is present,
`deleteReason` ends with `-cascade`, `meta.cascade === true`, or
`meta.cascadeKind` is present. `cascadeRootCount` covers root tombstones such as
the F5D.2 `folder` tombstone with `deleteReason: 'folder-delete'`,
`meta.cascade === true`, and no `cascadeFrom`. `cascadeChildCount` covers
dependent tombstones such as `folderBinding` rows removed by that folder delete.

Only child cascade tombstones require `cascadeFrom`. The analyzer increments
`cascadeMissingParentRefCount` when a child cascade tombstone is missing
`cascadeFrom`; it does not warn for valid cascade roots.

The F5E.2a analyzer report is redacted and counts-only. It must not expose
`tombstoneId`, `recordId`, peer IDs, `cascadeFrom`, `meta` contents, chat IDs,
folder IDs, user-visible names, transcript text, or sample IDs. A missing
`deleteReason` is counted under the `missing` delete-reason bucket so aggregate
counts remain explainable without exposing record identity.

## F5F.0/F5F.1 Remote Tombstone Review Scaffold

F5F.0/F5F.1 adds a Desktop-local review queue scaffold for future remote
tombstone imports:

- SQLite table: `sync_tombstone_reviews`
- Desktop store module: `H2O.Studio.store.tombstoneReviews`
- Module file: `src-surfaces-base/studio/store/tombstone-reviews.tauri.js`

This scaffold is inert. It does not ingest bundle tombstones automatically,
does not call Desktop or Chrome importers, does not apply remote tombstones,
does not delete or mutate Library records, does not export review records, and
does not add UI or conflict-queue behavior. Remote tombstones remain evidence,
not commands.

The review row schema is:

```js
{
  schema: 'h2o.studio.tombstone-review.v1',
  reviewId,
  remoteTombstoneId,
  remoteSyncPeerId,
  remoteExportId,
  remoteSequenceNumber,
  recordKind,
  recordId,
  deleteReason,
  remoteDeletedAt,
  receivedAt,
  firstSeenAt,
  lastSeenAt,
  seenCount,
  lastSeenExportId,
  localRecordExists,
  localRecordDigest,
  localUpdatedAt,
  localHasNewerEdit,
  classification,
  status,
  decision,
  decidedAt,
  decidedBySyncPeerId,
  dedupeKey,
  rawTombstoneJson,
  warningsJson,
  createdAt,
  updatedAt
}
```

Allowed classifications are `safe-review`, `delete-vs-edit`,
`already-deleted-local`, `missing-local-record`, `cascade-review`,
`duplicate-remote-tombstone`, `malformed-remote-tombstone`,
`unsupported-record-kind`, `self-originated`, and
`local-comparison-unavailable`.

Allowed statuses are `pending`, `ignored`, `accepted-later`, `rejected`,
`superseded`, and `resolved`. `accepted-later` is only a placeholder status for
future reviewed-apply phases; no F5F.1 API applies deletes.

The F5F.1 API is:

```js
H2O.Studio.store.tombstoneReviews.createReview(record)
H2O.Studio.store.tombstoneReviews.upsertReviewSighting(record)
H2O.Studio.store.tombstoneReviews.getReview(reviewId)
H2O.Studio.store.tombstoneReviews.getByDedupeKey(dedupeKey)
H2O.Studio.store.tombstoneReviews.listReviews(filters)
H2O.Studio.store.tombstoneReviews.countByClassification(filters)
H2O.Studio.store.tombstoneReviews.countByStatus(filters)
H2O.Studio.store.tombstoneReviews.markIgnored(reviewId, reason)
H2O.Studio.store.tombstoneReviews.markRejected(reviewId, reason)
await H2O.Studio.store.tombstoneReviews.diagnose(options)
H2O.Studio.store.tombstoneReviews.validateReview(record)
H2O.Studio.store.tombstoneReviews.buildDedupeKey(input)
```

`upsertReviewSighting()` inserts a new row when `dedupeKey` is new. If the same
dedupe key already exists, it updates only `lastSeenAt`, increments `seenCount`,
updates `lastSeenExportId`, and preserves `firstSeenAt`.

Diagnostics use schema `h2o.studio.tombstone-review.diagnostic.v1` and are
redacted/content-free by default. They report totals, pending count,
classification counts, status counts, malformed count, self-originated count,
duplicate count, cascade review count, delete-vs-edit count, unsupported-kind
count, and module warnings. They must not expose full record IDs, tombstone IDs,
remote peer IDs, raw tombstone JSON, metadata contents, chat/folder names, or
transcript content.

## F5F.2 Manual Remote Tombstone Review Ingestion

F5F.2 adds a manual developer API for loading remote tombstone evidence into the
review queue:

```js
await H2O.Studio.store.tombstoneReviews.ingestBundleTombstones(bundle, {
  source: 'manual-test',
  dryRun: false,
  allowSelfOrigin: false
})
```

This API is manual only. It is not called from Desktop import, Chrome folder
import, export, sync, or delete paths. It does not apply tombstones, delete
records, mutate folders/chats/snapshots/tags/labels/categories, export review
records, add UI, or enable bidirectional sync.

The method accepts a full bundle object or a minimal object containing
`tombstoneSchemaVersion`, `tombstones`, `sourceSyncPeerId`, `exportId`, and
`sequenceNumber`. Missing `tombstones` returns `ok: true` with
`missing-tombstone-array`. A non-array `tombstones` value returns `ok: true`
with `tombstones-not-array`. A non-object bundle returns `ok: false`.

By default, if `bundle.sourceSyncPeerId` matches local
`H2O.Studio.identity.whenReady().syncPeerId`, rows are skipped and counted under
`selfOriginatedIgnored`; no pending review rows are created. If local identity is
unavailable, F5F.2 warns and treats the bundle as remote evidence.

Remote tombstones are validated independently. Required fields are `schema`,
`tombstoneId`, `recordKind`, `recordId`, `deletedAt`,
`deletedBySyncPeerId`, and `deleteReason`. Malformed tombstones become
`malformed-remote-tombstone` reviews when enough data exists to build a dedupe
key; otherwise they are counted as `skippedMalformed`. Known but unsupported
record kinds become `unsupported-record-kind` reviews. F5F.2 performs read-only
local comparison only for `folder` and `folderBinding` tombstones.

Folder tombstones are classified as `missing-local-record`, `delete-vs-edit`, or
`safe-review` based on whether the local folder exists and whether its
`updated_at` is newer than the remote `deletedAt`. Folder-binding tombstones
prefer `meta.chatId` and `meta.folderId`, falling back to
`folderBinding:<encodedChatId>:<encodedFolderId>`, then read
`folder_bindings` without mutation. Cascade-related folder-binding tombstones
are classified as `cascade-review` unless malformed. Missing cascade parents are
reported as warnings only.

Dedupe uses `remoteSyncPeerId + remoteTombstoneId` first and falls back to
`remoteSyncPeerId + recordKind + recordId + deletedAt`. Re-ingesting the same
remote tombstone updates `lastSeenAt`, increments `seenCount`, updates
`lastSeenExportId`, and does not create duplicate pending rows.

The ingest result uses schema `h2o.studio.tombstone-review-ingest.v1` and is
redacted/counts-only by default:

```js
{
  ok,
  dryRun,
  source,
  sourceSyncPeerIdPresent,
  exportIdPresent,
  sequenceNumberPresent,
  found,
  inserted,
  updated,
  skipped,
  selfOriginatedIgnored,
  malformed,
  skippedMalformed,
  unsupported,
  failed,
  byClassification,
  byStatus,
  warnings
}
```

The result must not expose full record IDs, tombstone IDs, remote peer IDs, raw
tombstones, metadata, user-visible names, or transcript content. Passing
`dryRun: true` performs validation and classification but writes no review rows.

## F5F.3b Hidden Runner Review Diagnostics

F5F.3b exposes remote tombstone review queue health in the hidden F1B readiness
runner as counts-only diagnostics. It keeps `multi-peer-diff.js` pure: the
analyzer still reads only the in-memory bundle/local-state input, while the
runner separately calls:

```js
await H2O.Studio.store.tombstoneReviews.diagnose()
```

when the review store is available. The runner normalizes that diagnostic into
an in-memory `report.tombstoneReviews` section:

```js
{
  supported: true,
  available: true,
  total,
  pending,
  byClassification,
  byStatus,
  malformedCount,
  selfOriginatedIgnoredCount,
  duplicateCount,
  cascadeReviewCount,
  deleteVsEditCount,
  unsupportedKindCount,
  warnings
}
```

If the review store is unavailable or `diagnose()` fails, the runner reports
`available: false`, zero counts, and a warning code. The readiness check still
runs and no exception is surfaced to users.

The hidden panel displays a separate section labeled:

`Remote tombstone reviews (evidence only; no apply)`

Displayed fields are counts only: availability, total, pending,
`cascade-review`, `delete-vs-edit`, malformed, unsupported, and warning count.
This section is intentionally separate from exported `tombstones` payload
diagnostics and `tombstoneCandidates` absence-risk diagnostics.

F5F.3b does not wire importers, apply tombstones, mutate Library records, change
delete behavior, export review records, add public UI/settings, or change root
`latest.json` behavior. It must not display review IDs, remote tombstone IDs,
record IDs, peer IDs, raw tombstone JSON, metadata, user-visible names, or
transcript content.

## F5F.4a Desktop Importer Manual Review-Ingest Gate

F5F.4a adds an explicit Desktop-only importer option that can queue remote
tombstones as review evidence after a normal Desktop import:

```js
await H2O.Studio.ingestion.importBundle(bundle, 'merge', {
  ingestTombstoneReviews: true
})
```

The option defaults to off. Calls that omit the third argument keep the existing
Desktop import behavior and return shape. Chrome folder sync, Chrome
`syncNow()`, export, delete paths, and public UI/settings are unchanged.

When enabled, Desktop import still runs the normal merge importer first. After
that import completes, it calls:

```js
H2O.Studio.store.tombstoneReviews.ingestBundleTombstones(bundle, {
  source: 'desktop-import-bundle',
  dryRun: false,
  allowSelfOrigin: false,
  importMode: mode,
  bundleExportId: bundle.exportId,
  bundleSourceSyncPeerId: bundle.sourceSyncPeerId
})
```

The review ingest is best-effort and cannot change the normal import result's
`ok` value. If the review store is unavailable or throws, the importer returns a
redacted `tombstoneReviewIngest` warning object and normal import success/failure
still reflects only the normal importer.

The gated result shape is counts-only:

```js
{
  tombstoneReviewIngest: {
    attempted: true,
    ok,
    found,
    inserted,
    updated,
    skipped,
    selfOriginatedIgnored,
    malformed,
    unsupported,
    failed,
    warnings
  }
}
```

The result must not expose full record IDs, tombstone IDs, peer IDs, raw
tombstones, metadata, user-visible names, or transcript content. F5F.4a does not
apply tombstones, delete local records, mutate Library records from tombstone
evidence, add conflict/apply UI, purge, restore, bidirectional sync, WebDAV, or
Chrome importer integration.

## F5F.4b Desktop Review-Ingest Dry Run

F5F.4b adds a dry-run option for only the tombstone review ingestion portion of
Desktop import:

```js
await H2O.Studio.ingestion.importBundle(bundle, 'merge', {
  ingestTombstoneReviews: true,
  tombstoneReviewDryRun: true
})
```

This is not a full import dry-run. The normal Desktop import still runs exactly
as requested by the caller. Only the follow-up
`tombstoneReviews.ingestBundleTombstones()` call receives `dryRun: true`, so it
classifies the bundle's tombstones without writing review rows.

The gated result includes `dryRun: true`:

```js
{
  tombstoneReviewIngest: {
    attempted: true,
    dryRun: true,
    ok,
    found,
    inserted,
    updated,
    skipped,
    selfOriginatedIgnored,
    malformed,
    unsupported,
    failed,
    warnings
  }
}
```

In F5F.4b, `inserted` and `updated` reflect whatever
`ingestBundleTombstones(..., { dryRun: true })` reports. The current review-store
dry run validates and classifies tombstones, prevents writes, and may return zero
for insert/update prediction. More precise dedupe prediction can be added later
without changing this importer gate.

Default import calls still omit `tombstoneReviewIngest`, and F5F.4a write mode
continues to pass `dryRun: false`. Review dry-run failure does not affect normal
import `ok`. F5F.4b does not apply tombstones, mutate Library records from
tombstone evidence, change Chrome sync, export paths, delete stores, or UI.

## Future Envelope Model

Future exports should use a top-level array:

```js
{
  tombstones: []
}
```

Absence of `tombstones` means the bundle does not carry tombstone data. It must
not mean no deletes exist.

Per-record `isDeleted` is insufficient by itself because it only represents
state on records that still exist in the bundle. A top-level `tombstones[]`
array is needed for records intentionally removed from active record arrays.

No F5A/F5B change is made to `h2o.studio.fullBundle.v2`, root `latest.json`,
Chrome import, or the F4 per-peer mirror.

## Diagnostics Model

Future diagnostics should be read-only and redacted by default:

- tombstone counts by `recordKind`,
- active vs restored tombstones,
- delete-vs-edit conflicts,
- binding-to-deleted-parent conflicts,
- assignment-to-deleted-definition conflicts,
- purgeable tombstone candidates,
- restore candidates,
- cascade chains.

Diagnostics must not expose chat content, snapshot text, prompt/answer bodies,
or full peer identifiers by default.

## Future UI Notes

No UI is part of F5A/F5B. Later UI should include:

- deleted-items view,
- restore action,
- conflict review,
- purge action,
- destructive-delete warnings,
- cascade preview before deleting containers or definitions.

## Migration Strategy

1. F5A: audit current delete behavior and delete callers.
2. F5B: document tombstone schema and policy.
3. F5C: add local tombstone store scaffold, no behavior change.
4. F5D: route local delete actions to write tombstones, no remote apply.
5. F5E: export tombstones read-only.
6. F5F: import tombstones into diagnostics/conflict queue only.
7. F5G: reviewed apply/restore behind explicit controls.
8. F5H: retention, purge, and compaction.

## Risks

| Risk | Mitigation |
| --- | --- |
| Accidental data loss | No automatic remote tombstone apply. |
| Silent delete propagation | Tombstones are explicit and reviewed before apply. |
| Tombstone bloat | Defer purge until peer watermarks and diagnostics exist. |
| Cascade mistakes | Record dependent tombstones with `cascadeFrom`. |
| Linked-only vs saved snapshot confusion | Separate `linkedOnlyChat` and `savedSnapshot` policies. |
| Hard-delete bypasses | Route all remove/unbind/replace paths through one future tombstone API. |
| Restore conflicts | Preserve tombstones and model restore explicitly. |
| Privacy leakage | Redact peer IDs and never include content in diagnostics. |
| Clock skew | Use source export IDs and sequence numbers, not wall clock alone. |

## Acceptance Criteria For F5A/F5B

- Current delete behavior is documented by record kind.
- Known hard-delete and binding-clear paths are listed.
- Tombstone schema is documented with required local fields.
- `sourceExportId` and `sourceSequenceNumber` are documented as optional until
  tombstones are exported/imported.
- Per-record-kind delete policies are documented.
- Cascade rules are documented.
- Delete-vs-edit conflict policy is documented.
- Restore, retention, storage, envelope, diagnostics, UI, migration, and risk
  models are documented.
- No runtime behavior changes are made.
- No migrations are added.
- No export/import behavior is changed.
