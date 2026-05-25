# F9 Mobile Read-Only Peer Model

## Executive Summary

F9 starts as a mobile read-only peer. Mobile consumes existing sync bundle
evidence, renders library state safely, and must not write back or mutate
Desktop, Chrome, mobile source data, or any sync lifecycle state.

The F9 model is:

```txt
read bundle -> validate -> cache/display -> no mutation
```

## Recommended Data Source

The first mobile input source should be a copied or exported `latest.json`
bundle from the existing sync folder.

Later phases may inspect the per-peer mirror under
`devices/<peer>/latest.json`, but F9.0-F9.2 do not require a cloud relay,
WebDAV, or any other transport. Cloud/WebDAV is future transport, not part of
the initial mobile peer model.

Mobile is not authoritative over Desktop or Chrome state.

## Mobile Peer Identity And Capabilities

A read-only mobile peer may still have identity for diagnostics, display, and
future compatibility:

```js
{
  surfaceKind: "mobile",
  appKind: "h2o-mobile",
  storeKind: "bundle-cache",
  capabilities: ["read-only"]
}
```

This identity does not imply write authority. It must not authorize tombstones,
conflict ingestion, apply, export authority, or remote mutation.

## Read-Only Data Scope

Initial mobile read scope:

- Indexed chats.
- Saved snapshots.
- Folder metadata.
- Folder memberships as exported evidence.
- Labels and categories if already present in the bundle.
- Export envelope and sync diagnostics.
- F5 tombstone/review counts read-only.
- F6 conflict counts and read-only status.
- F7 apply audit evidence read-only.
- F8 `syncApplyEvents` read-only.

Avoid in F9:

- Folder metadata editing.
- FolderBinding or membership updates.
- Folder creation or deletion.
- Chat or snapshot deletion/restoration.
- Conflict decisions.
- Candidate ingestion.
- Mobile annotations or write-back.
- Remote apply propagation.

## Safety Rules

Mobile must never:

- Create tombstones.
- Ingest conflict candidates.
- Mark F6 decisions.
- Run F7 folder color apply.
- Produce authoritative exports.
- Write Chrome or Desktop state.
- Mutate folders, folderBindings, chats, snapshots, labels, categories,
  tombstones, conflicts, audits, or apply events.

Any mobile cache is local and non-authoritative. It may exist to support
offline reading, but it is not sync source data.

## UI And Read Model

Mobile may show:

- Library and chat list.
- Saved snapshot reader.
- Folder browser.
- Label/category filters if present.
- Sync status and export freshness.
- Read-only tombstone/conflict indicators.
- Persistent read-only badge.
- Clear copy near risky surfaces, such as: "This device cannot edit or sync
  changes."

F9 must not expose edit controls.

## F5/F6/F7/F8 Integration

- F5 evidence is visible read-only only.
- F6 queue state is visible read-only only.
- F7 apply audit evidence is visible read-only only.
- F8 apply-event evidence is visible read-only only.
- F9 must not call mutation APIs from F5, F6, F7, or F8.

## F9.1b — Mobile Latest Bundle Diagnostic Helper

F9.1b adds a mobile-local pure helper for Desktop `latest.json` bundles:

```txt
latest.json -> validate -> count/presence diagnostics -> read-only result
```

The helper is diagnostic only. It does not merge the Desktop bundle into the
mobile archive store, does not write a mobile archive, does not call WebDAV or
cloud transport, and does not make mobile authoritative.

The public helper shape is:

```ts
diagnoseMobileSyncBundle(input, {
  verifyChecksum,
  sha256Hex
})
```

Supported input is raw JSON text or an already parsed bundle. The first
supported Desktop bundle schema is `h2o.studio.fullBundle.v2`.

Diagnostics are redacted and read-only:

```js
{
  schema: "h2o.mobile.bundle-reader.diagnostic.v1",
  ok: true,
  redacted: true,
  readOnly: true,
  source: {
    kind: "latest-json",
    schemaPresent: true,
    checksumPresent: true,
    checksumVerified: true,
    sourcePeerPresent: true,
    exportedAtPresent: true
  },
  counts: {
    chats: 0,
    snapshots: 0,
    folders: 0,
    folderMemberships: 0,
    labels: 0,
    categories: 0,
    conflicts: 0,
    tombstones: 0,
    applyEvents: 0
  },
  capabilities: ["read-only"],
  blockers: [],
  warnings: []
}
```

F9.1b inspects only presence and counts from the export envelope,
`chatArchive`, Chrome folder state evidence, `libraryKv`, F5 tombstone
evidence, F8 `syncApplyEvents`, sync conflict evidence if present, Desktop
export diagnostics, and `summary` fallback counts.

Checksum verification is optional and injected. The helper must not hard-couple
to Expo crypto. If `verifyChecksum` is enabled, the expected hash input is:

```txt
JSON.stringify(bundleWithoutContentSha256, null, 2) + "\n"
```

Missing checksum produces `bundle-checksum-unavailable`. A mismatch blocks
`latest-json` input with `bundle-checksum-mismatch`; pasted JSON receives a
warning instead.

F9.1b diagnostics must never expose chat text, prompts, answers, folder names,
raw IDs, peer IDs, raw hashes, raw audit JSON, or metadata blobs. Counts,
booleans, schema/status codes, and warning/blocker codes are allowed.

## F9.2a — Read-Only Bundle View Model

F9.2a adds a pure mobile view-model builder for Desktop `latest.json` bundle
evidence:

```txt
latest.json bundle -> read-only mobile view model
```

This is not UI and not storage. The view model must not merge into the mobile
archive store, write `AsyncStorage`, call WebDAV, create tombstones, ingest
conflict candidates, run apply APIs, or make mobile authoritative.

The public helper shape is:

```ts
buildMobileReadOnlyBundleView(bundle, {
  checksumVerified
})
```

The view schema is `h2o.mobile.readonly-library-view.v1`. It contains:

- `chats`: read-only chat rows with `idPresent`, optional `titlePreview`,
  `snapshotCount`, and `folderCount`.
- `folders`: read-only folder rows with `idPresent`, optional `namePreview`,
  `itemCount`, and `colorPresent`.
- `snapshots`: read-only snapshot metadata with presence booleans only.
- `diagnostics`: source schema, checksum, export timestamp, and source peer
  presence.
- `warnings`: code-only warning entries.

F9.2a may use user-facing titles and folder names in the UI view model because
they are already part of the user's imported bundle. Diagnostics, validation
logs, and status output must remain redacted and must not include raw IDs,
peer IDs, hashes, audit JSON, metadata blobs, prompts, answers, or snapshot
message content.

Folder membership is derived internally from Chrome folder-state evidence. Raw
folder, chat, and snapshot IDs may be used transiently to compute `itemCount`
and `folderCount`, but the returned view model must expose only presence
booleans and counts.

Snapshot support in F9.2a is list metadata only. A full read-only snapshot
reader is deferred to F9.2c.

## F9.2b.1 — Read-Only Bundle Display Component

F9.2b.1 adds a presentational mobile component for the read-only bundle view:

```txt
MobileReadOnlyLibraryView -> static read-only component
```

The component renders a read-only bundle header, source presence diagnostics,
library rows, folder rows, empty states, and code-only warnings. It does not
wire a route, parse files, read from the archive store, call WebDAV, navigate,
mutate state, or expose edit controls.

The component input is:

```ts
type ReadOnlyBundleDisplayProps = {
  view: MobileReadOnlyLibraryView;
};
```

Rendered sections:

- Library: chat title previews when available, snapshot counts, folder counts,
  and a static read-only indicator.
- Folders: folder name previews when available, item counts, color-presence
  indicators, and a static locked indicator.
- Diagnostics: source schema, export timestamp, source peer, and checksum
  presence.
- Warnings: code-only warning rows.

Normal UI may show user-owned title and folder-name previews. The component
must not log the full view model or expose raw IDs, peer IDs, raw hashes, audit
JSON, metadata blobs, prompts, answers, or snapshot message content.

F9.2b.1 intentionally does not add route integration. The next UI phase may
mount the component in a route or dev surface, but only after preserving the
same read-only data boundary.

## F9.2b.2 — Mock Read-Only Bundle Route

F9.2b.2 adds a separate mobile route for the read-only bundle display:

```txt
mock MobileReadOnlyLibraryView -> ReadOnlyBundleDisplay route
```

The route is intentionally mock-only. It does not parse a real bundle, import a
file, read from the mobile archive store, call WebDAV, persist cache data,
write back, or expose edit/sync controls. It is not linked from the main
sidebar or menu in this phase.

The route exists to prove safe route wiring for `ReadOnlyBundleDisplay`
without touching the existing mutable `/library`, `/folders`, `/folders/[id]`,
or `/import-export` screens.

Real bundle input, pasted bundle text, file picker support, diagnostics route
integration, and snapshot content reading remain deferred.

## F9.2b.3 — In-Memory Pasted Bundle Preview

F9.2b.3 changes the read-only bundle route from mock-only to pasted-text
preview:

```txt
paste latest.json -> diagnose -> build read-only view -> display
```

The route uses local React state only. It does not save pasted text, import the
bundle, merge archive data, call WebDAV, create cache state, or write back to
Desktop, Chrome, or mobile stores.

Validation uses `diagnoseMobileSyncBundle` with `sourceKind: "pasted-json"`.
Checksum mismatch is a warning for pasted JSON because copied content may be
reformatted. A future original-file path can still block on checksum mismatch.

If validation returns blockers, the route shows blocker codes and does not
render the bundle view. If validation passes, it derives
`MobileReadOnlyLibraryView` with `buildMobileReadOnlyBundleView` and renders
`ReadOnlyBundleDisplay`.

The UI must not expose controls for save, import, merge, sync, push/pull,
edit, delete, restore, move, apply, or conflict decisions. It may show
user-owned title and folder-name previews only through the read-only display
component.

File picker, WebDAV/cloud transport, route menu wiring, persistent cache,
diagnostics screen integration, and snapshot content reading remain deferred.

## F9.2c.1 — Read-Only Snapshot Detail Model

F9.2c.1 adds a pure snapshot detail model:

```txt
latest.json snapshot evidence -> read-only snapshot detail model
```

The model reads Desktop full-bundle snapshot evidence from
`chatArchive.chats[].snapshots[]` and prefers `snapshot.messages[]` as the
content source. It does not parse or return `meta.richTurns` HTML data.

The helper shape is:

```ts
buildMobileReadOnlySnapshotDetail(bundle, {
  snapshotIndex
})
```

The returned detail uses schema `h2o.mobile.readonly-snapshot-detail.v1`,
includes read-only message turns, and never returns raw snapshot IDs, chat IDs,
digests, raw hashes, metadata blobs, or audit JSON.

Returned message text is intended for future read-only UI display only.
Validation output, logs, and diagnostics must not print full message content.

F9.2c.1 does not add a UI reader, does not wire local snapshot selection into
the route, and does not touch archive-store, WebDAV, mutable chat routes,
`TurnBlock`, or edit/save/delete/restore controls. F9.2c.2 will add a
presentational read-only snapshot reader.

## F9.2c.2 — Presentational Read-Only Snapshot Reader

F9.2c.2 adds a presentational mobile component for snapshot details:

```txt
MobileReadOnlySnapshotDetail -> static read-only snapshot reader
```

The component renders a read-only snapshot header, title preview, presence
metadata, content kind, message count, warning codes, missing/empty states, and
message turns from `MobileReadOnlySnapshotDetail`.

Rendering is intentionally plain text first. F9.2c.2 does not use `TurnBlock`,
does not use a Markdown renderer, does not parse rich HTML turns, and does not
add edit, save, delete, restore, sync, apply, conflict-decision, copy-menu, or
navigation controls.

F9.2c.2 does not wire snapshot selection into the `read-only-bundle` route. It
does not read from archive-store, does not call WebDAV, does not persist cache
state, and does not write back to Desktop, Chrome, or mobile stores.

Message text may be displayed in the normal read-only UI because it is
user-owned bundle content. Logs, diagnostics, validation output, and docs must
not print full message content, raw IDs, peer IDs, hashes, audit JSON, or
metadata blobs.

F9.2c.3 may wire local in-memory snapshot selection into the read-only bundle
route, but only if the same display-only and no-write boundary is preserved.

## F9.2c.3 — Local Snapshot Selection In Read-Only Route

F9.2c.3 wires local snapshot selection into the `read-only-bundle` route:

```txt
local snapshot row -> selectedSnapshotIndex -> read-only detail -> local back
```

The route stores the parsed pasted bundle, `MobileReadOnlyLibraryView`, and the
selected snapshot index in local React state only. When a pasted bundle is
successfully validated and read, the route resets the selected snapshot and
keeps the parsed bundle only in memory.

Snapshot rows are rendered from `view.snapshots`. Selecting a row only updates
`selectedSnapshotIndex`; it does not navigate to `/chat/[id]`, open the mobile
archive, persist state, write cache data, call WebDAV, or mutate source data.

When a snapshot is selected, the route derives
`MobileReadOnlySnapshotDetail` with `buildMobileReadOnlySnapshotDetail` and
renders `ReadOnlySnapshotReader`. The back control only clears the selected
snapshot index and returns to the read-only bundle display.

F9.2c.3 must not expose edit, save, restore, delete, sync, import, conflict
decision, or apply controls. It must not call archive-store, WebDAV,
tombstone, conflict, F7 apply, or F8 remote-apply mutation paths.

## F9.2d — Read-Only Bundle Status

F9.2d adds a redacted diagnostics/status component for the pasted bundle route:

```txt
diagnostic + view -> redacted status display
```

The status component renders read-only capability chips, source presence,
checksum presence/verification, content counts, sync evidence counts, and
code-only blocker/warning lists. It is wired into `read-only-bundle` after
bundle diagnosis and before the library/folder/snapshot display.

The status output is code/count-only. It may show booleans, counts, capability
labels, status labels, and warning/blocker codes. It must not show chat text,
prompts, answers, folder names, raw IDs, peer IDs, raw hashes, audit JSON, or
metadata blobs.

F9.2d completes the read-only route loop:

```txt
paste -> diagnose -> status -> library/folders -> snapshots
```

It does not save, import, sync, apply, resolve, call archive-store, call
WebDAV, persist cache state, mutate bundle data, or write back to Desktop,
Chrome, or mobile stores.

## F9.2 Closeout — Mobile Read-Only Bundle Viewer Boundary

F9.2 completes the first mobile read-only bundle viewer loop. Mobile can now
accept pasted Desktop `latest.json` text in memory, diagnose the bundle, build
a read-only library view, render library/folder rows, select snapshots with
local route state, render read-only snapshot content, and show redacted status
counts.

The completed chain is:

```txt
paste latest.json
-> diagnoseMobileSyncBundle
-> readMobileSyncBundle
-> buildMobileReadOnlyBundleView
-> ReadOnlyBundleStatus
-> ReadOnlyBundleDisplay
-> local selectedSnapshotIndex
-> buildMobileReadOnlySnapshotDetail
-> ReadOnlySnapshotReader
```

The current boundary remains read-only:

- No archive-store writes.
- No `replaceArchiveStore`.
- No `saveArchiveStore`.
- No WebDAV pull or push.
- No persistence or cache.
- No mobile write-back.
- No folder, chat, snapshot, label, or category edits.
- No folder creation or deletion.
- No folderBinding mutation.
- No conflict candidate ingestion.
- No conflict decisions.
- No F7 or F8 apply APIs.
- No sync propagation.
- No cloud/WebDAV transport.
- No mutation controls in the read-only route.

Safety meaning:

- Mobile is a viewer, not an authority.
- Pasted bundle data is preview evidence, not imported state.
- Local route state is temporary and non-authoritative.
- Snapshot viewing is read-only content display.
- Diagnostics and status remain code/count-only.

Validation status:

- Targeted TypeScript checks passed for the read-only bundle route and sync
  components.
- Forbidden-call grep checks passed for archive-store, WebDAV, conflict,
  apply, snapshot mutation, and `TurnBlock` paths.
- Real `latest.json` reader validation passed earlier in F9.1c.
- F9.2 added no archive-store, WebDAV, persistence, write-back, or F5/F6/F7/F8
  mutation calls.

Recommended next options:

- F9.3 planning: mobile conflict/tombstone/apply-event read-only status
  details.
- F9.4 planning: offline and non-authoritative cache validation.
- Production hardening and UX polish.
- F10 mobile write-back remains much later and must not start from F9.2.

The recommended next planning step is F9.3. Keep it read-only: no decisions, no
ingestion, no apply, and no write-back.

## F9.3a — Read-Only Sync Evidence View Model

F9.3a adds a pure mobile view model for sync evidence already present in the
pasted Desktop `latest.json` bundle:

```txt
latest.json evidence -> read-only sync evidence view model
```

The helper shape is:

```ts
buildMobileReadOnlySyncEvidenceView(bundle)
```

The returned schema is `h2o.mobile.readonly-sync-evidence-view.v1`. It contains
code/count-only sections for:

- Tombstone/delete evidence: availability, total count, and warning codes.
- Conflict evidence: availability, total count, and warning codes.
- Apply-event evidence: availability, total count, capped/skipped-malformed
  metadata, and safe warning codes from `syncApplyEvents`.

The model always returns `capabilities: ["read-only"]`. Missing or malformed
optional sections return warnings and zero counts rather than throwing.

F9.3a must not expose raw IDs, peer IDs, hashes, folder names, chat text, audit
row IDs, raw audit JSON, tombstone IDs, conflict IDs, or metadata blobs.
Allowed output is limited to counts, booleans, availability flags, capability
labels, and warning codes.

F9.3a does not add UI, route wiring, archive-store access, WebDAV, persistence,
conflict ingestion, conflict decisions, tombstone creation, F7/F8 apply, or
mobile write-back. F9.3b may add a presentational read-only evidence status
component.

## F9.3b — Presentational Sync Evidence Status

F9.3b adds a presentational component for the sync evidence view model:

```txt
MobileReadOnlySyncEvidenceView -> static evidence status component
```

The component renders read-only sections for tombstone evidence, conflict
evidence, apply-event evidence, and capability labels. It shows only
availability flags, counts, capped/skipped-malformed apply-event metadata, and
warning codes.

The component explicitly labels unavailable sections as unavailable in the
current bundle. It must not imply that missing F6 conflict rows are a complete
conflict queue.

F9.3b has no buttons, press handlers, long-press handlers, navigation, route
wiring, archive-store access, WebDAV, persistence, conflict ingestion,
conflict decisions, tombstone creation, F7/F8 apply, delete/restore behavior,
or mobile write-back. F9.3c may wire the component into the read-only bundle
route.

## F9.3c — Sync Evidence Status Route Wiring

F9.3c wires read-only sync evidence status into the `read-only-bundle` route:

```txt
local parsed bundle -> read-only sync evidence view -> status component
```

The route derives `MobileReadOnlySyncEvidenceView` from the existing
route-local parsed bundle with `buildMobileReadOnlySyncEvidenceView`. It
renders `ReadOnlySyncEvidenceStatus` on the bundle overview screen after
general bundle status and before the library/folder/snapshot display.

The evidence status is not shown in snapshot detail mode, keeping snapshot
reading focused and avoiding extra route clutter.

F9.3c does not add archive-store access, WebDAV, persistence, tombstone
creation, conflict candidate ingestion, conflict decisions, delete/restore
behavior, F7/F8 apply, mobile write-back, or any sync propagation behavior.

## F9.3 Closeout — Mobile Read-Only Sync Evidence Status Boundary

F9.3 completes mobile read-only sync evidence status for the pasted bundle
route. Mobile can now derive sync evidence from the current in-memory Desktop
`latest.json` bundle and display tombstone, conflict, and apply-event status
without turning any evidence into an action surface.

F9.3 now provides:

- A pure read-only sync evidence view model.
- A presentational read-only sync evidence status component.
- Route-local wiring into the pasted `latest.json` preview route.
- Tombstone evidence counts and availability status.
- Conflict evidence counts and unavailable-state display.
- Apply-event evidence counts, availability, capped state, and skipped
  malformed count.
- Read-only capability/status labels.
- Code/count-only warning display.

The current chain is:

```txt
paste latest.json
-> diagnoseMobileSyncBundle
-> readMobileSyncBundle
-> buildMobileReadOnlyBundleView
-> buildMobileReadOnlySyncEvidenceView
-> ReadOnlyBundleStatus
-> ReadOnlySyncEvidenceStatus
-> ReadOnlyBundleDisplay
-> local selectedSnapshotIndex
-> buildMobileReadOnlySnapshotDetail
-> ReadOnlySnapshotReader
```

The current boundary remains read-only:

- No archive-store writes.
- No `replaceArchiveStore`.
- No `saveArchiveStore`.
- No WebDAV pull or push.
- No persistence or cache.
- No mobile write-back.
- No tombstone creation, deletion, or restoration.
- No conflict candidate ingestion.
- No conflict decisions.
- No F7 or F8 apply APIs.
- No sync propagation.
- No mutation controls in the read-only route.
- No treatment of pasted bundle data as imported state.

Safety meaning:

- Mobile is still a viewer, not an authority.
- Pasted bundle data is preview evidence, not imported state.
- Sync evidence status is display-only.
- Conflict, tombstone, and apply-event counts are not editable queues.
- Route state remains local, temporary, and non-authoritative.

Validation status:

- Targeted TypeScript checks passed for the read-only route and sync evidence
  components.
- Forbidden-call grep checks passed for archive-store, WebDAV, conflict,
  apply, tombstone, snapshot mutation, and `TurnBlock` paths.
- Real `latest.json` reader validation passed earlier in F9.1c.
- F9.3 added no archive-store, WebDAV, persistence, write-back, or F5/F6/F7/F8
  mutation calls.
- Git was clean after F9.3c.

Recommended next options:

- F9.4 planning: offline and non-authoritative cache validation.
- Production hardening and UX polish.
- F10 mobile write-back remains much later and must not start from F9.3.

The recommended next planning step is F9.4. Keep it read-only and focused on
offline/non-authoritative cache validation.

## F9.4.0 — Offline Non-Authoritative Cache Safety Model

F9.4 starts as cache safety planning only. The mobile cache is for offline
read-only display convenience. It is not a sync source, not authority, and not
write-back.

The cache boundary is:

```txt
latest.json -> validate -> cache read-only/non-authoritative data -> offline display
```

It must not become:

```txt
cache -> export
cache -> sync source
cache -> write-back
cache -> conflict authority
```

Required non-authority contract:

- `readOnly: true`.
- `nonAuthoritative: true`.
- No outbound export.
- No sync propagation.
- No conflict decisions.
- No apply behavior.
- No tombstone/delete/restore behavior.
- No archive-store merge.

Cache content options:

- Option A: cache original pasted or `latest.json` text. This is easiest to
  rehydrate and preserves snapshots, but has the highest privacy and storage
  footprint.
- Option B: cache the parsed bundle object. This has similar privacy risk and
  adds migration/versioning concerns.
- Option C: cache derived read-only view models. This is lower risk than raw
  bundle caching, but may lose snapshot content unless that content is included.
- Option D: cache minimal diagnostics and counts only. This is safest but least
  useful for offline library/snapshot browsing.

Recommendation for F9.4.0: do not cache the full bundle or snapshot content
yet. Start with the docs-only safety model. A later implementation should
likely begin with metadata/diagnostics caching only. Full view or snapshot
content caching requires explicit privacy and clear-cache UX approval.

Storage/key strategy:

- Avoid the existing archive-store.
- Avoid sync/archive storage keys.
- Do not use WebDAV or cloud transport.
- Use a separate future namespace such as
  `h2o.mobile.readonly.bundle-cache.v1`.

Future storage options:

- AsyncStorage: simple, but not encrypted.
- SecureStore: safer, but poor for large bundles.
- File/document storage: better for large content, but requires more lifecycle
  and privacy work.
- Existing archive-store: forbidden for this cache.

Minimum safe cache metadata:

```js
{
  schema: "h2o.mobile.readonly.bundle-cache.v1",
  readOnly: true,
  nonAuthoritative: true,
  cachedAt,
  sourceKind,
  sourceSchemaPresent,
  exportedAtPresent,
  checksumPresent,
  checksumVerified,
  sourcePeerPresent,
  counts,
  warnings
}
```

Cache metadata must not contain raw IDs, raw hashes, raw audit JSON, or mutation
capabilities.

Clear and invalidation behavior:

- Provide a manual "Clear read-only cache" action before any content cache is
  considered complete.
- Unsupported cache schema invalidates safely.
- Malformed cache warns and does not crash.
- Optional max-age warning may be added.
- No auto-refresh.
- No background WebDAV polling.
- No sync/import on cache load.

Future UI may show:

- Loaded from read-only cache.
- Clear cache.
- Paste newer bundle.
- Cache freshness or exportedAt presence.
- Checksum status.

Future UI must not show:

- Sync now.
- Push or pull.
- Import into archive.
- Write back.
- Resolve.
- Apply.
- Delete or restore.

Privacy and redaction policy:

- Full bundle or full view-model cache may store chat and snapshot content on
  mobile.
- Snapshot content cache is deferred or must be explicit opt-in.
- Logs must not print cached content.
- Diagnostics remain counts, presence flags, and code-only warnings.
- Secure or encrypted storage should be considered before content caching.
- Clear-cache behavior must remove all read-only cache keys and files.

F5/F6/F7/F8 integration remains display-only:

- Tombstones remain read-only.
- Conflicts remain read-only.
- Apply events remain read-only.
- No mutation APIs are called.
- No mobile peer authority is added.

Future implementation must prove:

- Cached data loads offline.
- Source bundle data is not mutated.
- Archive-store is not touched.
- Cache key is separate from archive/sync store.
- Clear cache removes the cache.
- Malformed cache fails safely.
- No write-back APIs are exposed.
- No WebDAV/cloud calls are made.
- No F5/F6/F7/F8 mutation calls are made.
- Redaction and logging remain safe.

Risks and mitigations:

- Cache mistaken as authoritative source: use explicit non-authoritative schema
  and visible labels.
- Snapshot privacy risk: defer full content caching until clear UX and privacy
  policy exists.
- Stale bundle shown as current: display cachedAt, exportedAt presence, and
  checksum status.
- Cache grows too large: define size and retention limits before full bundle
  caching.
- Accidental archive-store reuse: use a separate namespace and validate with
  forbidden-call grep checks.
- Hidden sync/write-back creep: no WebDAV, export, background refresh, or
  write-back controls.
- User confusion between preview cache and imported archive: label the cache as
  read-only preview cache only.

Recommended split:

- F9.4.0: docs-only cache safety model.
- F9.4.1: inspect mobile storage options.
- F9.4.2: cache metadata/read-only diagnostics only.
- F9.4.3: route/status wiring for metadata-only cache.
- F9.4.4: offline cache validation and UX hardening.
- F10: mobile write-back much later.

The recommended next step after F9.4.0 is F9.4.1 storage inspection. Do not
implement cache yet, and do not start F10.

## F9.4.2 — Read-Only Bundle Metadata Cache

F9.4.2 adds an isolated AsyncStorage-backed metadata cache for read-only bundle
diagnostics:

```txt
diagnostic metadata -> isolated read-only AsyncStorage cache
```

The cache key is:

```txt
h2o.mobile.readonly.bundle-cache.v1
```

The cache stores only:

- `readOnly: true`.
- `nonAuthoritative: true`.
- `cachedAt`.
- `sourceKind`.
- Source, export, checksum, and source-peer presence booleans.
- Counts for chats, snapshots, folders, folder memberships, labels,
  categories, tombstones, conflicts, and apply events.
- Code-only warnings.

The cache does not store full `latest.json` text, parsed full bundle objects,
snapshot message content, derived full view models, folder names, chat text,
raw IDs, peer IDs, raw hashes, audit JSON, tombstone IDs, conflict IDs, or
metadata blobs.

The cache API is metadata-only:

```ts
buildReadOnlyBundleCacheMetadata({ diagnostic, sourceKind, cachedAt })
saveReadOnlyBundleCacheMetadata(metadata)
loadReadOnlyBundleCacheMetadata()
clearReadOnlyBundleCacheMetadata()
```

`saveReadOnlyBundleCacheMetadata` normalizes the supplied metadata to the exact
cache shape before writing. `loadReadOnlyBundleCacheMetadata` rejects malformed
or unsupported-schema cache data with warning codes instead of throwing.
`clearReadOnlyBundleCacheMetadata` removes only the isolated read-only cache
key.

F9.4.2 does not add route wiring, UI, archive-store access, WebDAV, cloud,
persistence of bundle content, conflict ingestion, conflict decisions,
tombstone creation, F7/F8 apply, sync propagation, or mobile write-back. Full
bundle, full view-model, and snapshot-content caching remain deferred.

## F9.4.3 — Read-Only Metadata Cache Route Wiring

F9.4.3 wires the metadata-only cache into the mobile read-only bundle route and
status UI:

```txt
diagnostic metadata -> explicit metadata cache -> status display
```

The route may load cached metadata on mount, show metadata-only status, save
metadata after a successful pasted bundle diagnosis, and clear the isolated
read-only cache key. These operations are limited to:

```txt
h2o.mobile.readonly.bundle-cache.v1
```

F9.4.3 adds `ReadOnlyBundleCacheStatus`, a presentational status component for
the metadata cache. It renders only:

- Cache status.
- Cached-at timestamp.
- Source kind.
- Source, export, checksum, and source-peer presence booleans.
- Counts for chats, snapshots, folders, folder memberships, labels,
  categories, tombstones, conflicts, and apply events.
- Code-only warning lists.
- Read-only/non-authoritative capability labels.

The route uses explicit cache actions:

- `Save metadata cache` builds cache metadata from the current diagnostic and
  writes only the isolated metadata cache key.
- `Clear read-only cache` removes only the isolated metadata cache key.

There is no auto-save. Saving metadata is not an import operation and does not
make mobile authoritative.

The status copy must make the boundary clear:

- Metadata cache only.
- Only counts/status are cached.
- Bundle content is not cached.
- Paste a bundle again to view library and snapshots.

F9.4.3 does not cache full `latest.json` text, parsed bundle objects, snapshot
messages or content, full view models, folder names, chat text, raw IDs, peer
IDs, raw hashes, audit JSON, tombstone IDs, conflict IDs, or metadata blobs.
The metadata cache cannot restore bundle content and cannot render the
library/folder/snapshot viewer by itself.

F9.4.3 also does not add archive-store access, WebDAV/cloud transport, outbound
export, conflict ingestion, conflict decisions, tombstone creation/delete/
restore, F7/F8 apply behavior, sync propagation, or mobile write-back.

## F9.4 Closeout — Validated Metadata-Only Cache Boundary

F9.4 now provides a validated metadata-only offline cache boundary for the
mobile read-only bundle viewer:

- Isolated AsyncStorage metadata cache.
- Explicit `Save metadata cache`.
- Explicit `Clear read-only cache`.
- Route/status display for cached metadata.
- Validation script for save/load/clear behavior.
- Safe malformed and unsupported cache handling.
- Redaction checks that confirm no bundle/content data is stored.

The validated chain is:

```txt
diagnostic metadata/counts
-> buildReadOnlyBundleCacheMetadata
-> saveReadOnlyBundleCacheMetadata
-> loadReadOnlyBundleCacheMetadata
-> ReadOnlyBundleCacheStatus
-> clearReadOnlyBundleCacheMetadata
```

The cache key is:

```txt
h2o.mobile.readonly.bundle-cache.v1
```

The cache stores only:

- `schema`.
- `readOnly: true`.
- `nonAuthoritative: true`.
- `cachedAt`.
- Source kind.
- Source, checksum, export, and source-peer presence booleans.
- Counts.
- Warning codes.

The following remain forbidden:

- Full `latest.json` text cache.
- Parsed bundle object cache.
- Snapshot message/content cache.
- Full view-model cache.
- Archive-store writes.
- `replaceArchiveStore`.
- `saveArchiveStore`.
- WebDAV pull/push.
- Mobile write-back.
- Outbound export.
- Conflict decisions or candidate ingestion.
- F7/F8 apply APIs.
- Tombstone/delete/restore behavior.
- Treating the cache as sync authority.

Safety meaning:

- The cache is display metadata only.
- The cache is not imported archive state.
- The cache is not a sync source.
- The cache is not sufficient to render library or snapshots offline.
- The user must paste or load a bundle again for full content display.
- Clear cache affects only the isolated metadata key.

Validation summary:

- `tools/validation/sync/validate-mobile-readonly-cache.mjs` was committed.
- Missing cache load returned safely.
- Metadata build from a diagnostic passed.
- Save/load of valid metadata passed.
- Malformed JSON returned `readonly-cache-malformed`.
- Unsupported schema returned `readonly-cache-schema-unsupported`.
- Clear removed only the isolated cache key and preserved archive, WebDAV, and
  identity sentinel keys.
- Redaction scan passed.
- Forbidden-call grep passed.
- Full-tree `git diff --check` remained blocked by unrelated Studio CSS WIP,
  but scoped F9/mobile checks passed.

Recommended next options:

- Production hardening or UX polish.
- F9.5 file picker/import preview, read-only only.
- F10 mobile write-back planning much later, high risk.

Do not start F10 yet. If mobile read-only work continues, F9.5 should stay
read-only and focus on file picker/import preview without archive-store writes.

Next phases:

- F9.2b: Library and folder list display from the read-only view model.
- F9.2c: Snapshot read-only reader.
- F9.2d: Read-only status and diagnostics screen.

## Validation Model

Future implementation must prove:

- Loading a bundle does not mutate the source bundle.
- Any mobile cache is local and non-authoritative only.
- No write APIs are exposed.
- Malformed bundles fail safely.
- Missing bundle sections degrade gracefully.
- Redaction is preserved.
- Offline use from cached/imported bundle works.
- Conflict, tombstone, and apply evidence remain display-only.
- No Chrome/Desktop/F5/F6/F7/F8 mutation calls exist.

## Roadmap

- F9.0: Docs-only mobile read-only peer model.
- F9.1: Mobile bundle reader scaffold, validate `latest.json`, no writes
  except optional local cache.
- F9.2: Library/folder/snapshot read-only display.
- F9.3: Conflict/tombstone/apply-event read-only status.
- F9.4: Offline cache validation and redaction checks.
- F10: Mobile write-back much later, only after full safety model.

## Recommendation

The next phase after F9.0 should be F9.1 bundle reader scaffold. Do not
introduce write-back, cloud relay, conflict resolution, or mutation APIs in F9.
