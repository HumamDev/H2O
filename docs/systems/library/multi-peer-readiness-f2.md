# Multi-Peer Readiness — F2 (Peer Identity Scaffold)

## Status

F2 mints + persists a **peer identity** on every Studio surface that owns a
durable Library store. Identity-only — no envelope stamping, no sequence
numbers, no transport changes, no tombstones, no bidirectional apply, no
R-phase behavior change.

F3+ phases will read this identity to stamp outbound bundles and reason about
per-peer state. F2 lays the foundation; nothing else.

## Module

- File: [`src-surfaces-base/studio/sync/peer-identity.js`](../../../src-surfaces-base/studio/sync/peer-identity.js)
- Loaded via `studio.html` `<script>` tag.
- Packed via `tools/product/studio/pack-studio.mjs`.
- Loaded only inside Studio surfaces. Native content scripts on
  chatgpt.com / claude.ai / gemini.com do not include `studio.html` and do
  not load this module. A runtime surface-detector additionally bails out if
  the page is not recognized as a Studio surface — defense in depth.

## Identity model

```
PeerIdentity = {
  schema:           'h2o.studio.peer-identity.v1',
  installId:        '<uuidv4>',     // identity-correctness anchor
  physicalDeviceId: '<uuidv4>',     // best-effort, diagnostic-only
  syncPeerId:       '<surface>:<app>:<store>:<installId>',
  surfaceKind:      'studio-desktop' | 'studio-chrome' | 'studio-mobile' | 'studio-firefox',
  appKind:          'tauri-desktop' | 'mv3-chrome' | 'mv3-firefox' | 'expo-mobile',
  storeKind:        'sqlite' | 'idb-shared' | 'idb-archive' | 'expo-sqlite' | 'expo-fs',
  displayName:      '<≤80 chars, user-editable>',
  createdAt:        '<ISO>',
  updatedAt:        '<ISO>',
  surfaceHistory:   [{ surfaceKind, appKind, storeKind, observedUntil }]
}
```

### Field semantics — one rule per field

- **`installId`** — multi-peer protocols compare by this (via `syncPeerId`).
  Loss of `installId` (storage wipe, profile reset) means the peer is forever
  a new peer. That is correct behavior, not a bug.
- **`physicalDeviceId`** — best-effort. Two surfaces on the same OS may or may
  not share it. **No protocol decision branches on `physicalDeviceId`.** It is
  diagnostic-only and may be reconciled across surfaces by a later phase via
  a shared manifest.
- **`syncPeerId`** — derived. Cached for performance, but recomputed and
  validated on every load. If the cached value drifts from the derived value
  but all parts are valid, F2 silently repairs it. If parts are invalid, F2
  remints the whole identity.
- **`displayName`** — humans-only. Never matched, compared, or propagated
  without explicit later-phase work.
- **`surfaceHistory`** — Option-A surface-transition trace. If a load detects
  a different surface/app/store than was previously persisted (e.g., a user
  moved Tauri appdata between machines, or `idb-archive` → `idb-shared`
  migration), F2 preserves `installId`, updates current markers, and appends
  the prior surface to `surfaceHistory[]`. The peer is still "the same install."

## Storage

| Surface | Key | Backing store |
|---|---|---|
| Studio Desktop (Tauri) | `'h2o:sync:peer-identity:v1'` | `chrome.storage.local` shimmed to Tauri `kv_store` SQLite table |
| Studio Chrome (MV3) | `'h2o:sync:peer-identity:v1'` | native `chrome.storage.local` |
| Studio Mobile (Expo) | reserved (future) | TBD — Expo SecureStore + AsyncStorage |

**F2 writes only this single key per surface.** No other persistent writes,
no schema migrations, no SQLite table changes.

## Public API

```js
H2O.Studio.identity.whenReady()       // Promise<PeerIdentity | null>
H2O.Studio.identity.get()              // PeerIdentity | null (sync; null until init resolves)
H2O.Studio.identity.diagnose()         // UI-safe redacted view; OMITS installId,
                                        //   physicalDeviceId, and syncPeerId
H2O.Studio.identity.setDisplayName(s)  // Promise<PeerIdentity>; updates updatedAt
H2O.Studio.identity.constants          // { SURFACE_KIND, APP_KIND, STORE_KIND,
                                        //   CAPTURE_SOURCE, KEY, SCHEMA }
```

### Redaction rule

`diagnose()` returns:

```js
{
  status: 'pending' | 'ready',
  schema, surfaceKind, appKind, storeKind, displayName,
  createdAt, updatedAt,
  surfaceHistoryDepth,   // count only, not entries
  moduleVersion
}
```

It explicitly does **not** include:

- `installId` (sensitive identifier)
- `physicalDeviceId` (sensitive identifier)
- `syncPeerId` (composite that embeds `installId`)

UI code that wants to show "which peer is this" calls `diagnose()` and uses
`surfaceKind / appKind / storeKind / displayName`. Internal/dev code that
genuinely needs the full identity calls `get()`.

## Capture-source rule

A producer is a **sync peer** if and only if it owns a durable Library store
and writes its own per-peer export (later phase). Native content scripts on
chatgpt.com / claude.ai / gemini.com are **capture sources**, not peers. They
feed Chrome Studio's archive and are attributed at the record level via the
`CAPTURE_SOURCE` vocabulary in `H2O.Studio.identity.constants`. They never
mint peer identity. The architecture rule is enforced by:

- **Inclusion gate**: native content scripts never include `studio.html`.
- **Runtime gate**: `detectSurface()` returns `{ok:false}` on any page that is
  not a recognized Studio surface.
- **Type-level**: `SURFACE_KIND` does not contain `native-chatgpt` /
  `native-claude` / `native-gemini`.

## Lifecycle

### Cold start (no identity persisted)

1. `detectSurface()` → `{surfaceKind, appKind, storeKind}` or `{ok:false}` (bail).
2. Read `'h2o:sync:peer-identity:v1'` from `chrome.storage.local`. Empty.
3. Mint `installId`, `physicalDeviceId` via `crypto.randomUUID()` (fallback to
   `crypto.getRandomValues`).
4. Derive `syncPeerId = surfaceKind:appKind:storeKind:installId`.
5. Set `createdAt = updatedAt = now`, `displayName = '<surfaceKind> (<storeKind>)'`,
   `surfaceHistory = []`.
6. Persist.

### Warm start (valid identity persisted)

1. Read. Validate schema, fields, UUID shapes.
2. Reconcile surface (Option A) if surfaceKind/appKind/storeKind changed.
3. Repair `syncPeerId` if it drifted from the derived value.
4. If anything changed, persist; otherwise the storage is untouched.

### Corruption recovery

1. Validation fails (schema mismatch, bad UUID, missing field, …).
2. Log one warning to the console.
3. Mint fresh identity (treat as cold start).
4. Persist.

The corrupt record is overwritten; no manual cleanup needed.

## Rollback

- Remove the `<script>` tag in `studio.html`.
- Remove the two entries in `pack-studio.mjs` (`ARCHIVE_WORKBENCH_SOURCE_FILES`
  and `ARCHIVE_WORKBENCH_OUT_FILES`).
- Delete `src-surfaces-base/studio/sync/peer-identity.js`.
- Delete this doc.
- Optional cleanup: `chrome.storage.local.remove('h2o:sync:peer-identity:v1')`
  on each surface to wipe the persisted identity.

No schema migration to reverse. No bundle envelope change to undo. No
R-phase behavior touched.

## What F2 does **not** do

- Does not write to any storage other than `'h2o:sync:peer-identity:v1'`.
- Does not stamp `exportId`, `sequenceNumber`, `sourceSyncPeerId`, or
  `contentSha256` on the outbound bundle envelope (F3+).
- Does not create per-peer transport files like `/devices/<syncPeerId>/latest.json` (F4+).
- Does not propagate tombstones, run conflict apply, or do bidirectional sync.
- Does not modify `studio.js`, `studio.css`, any R-phase sync file, or the
  Tauri capabilities manifest.
- Does not touch `multi-peer-runner.js` — F1B's panel UI is unchanged. F1B
  integration (showing `surfaceKind / appKind / storeKind` in the panel
  header) is deferred to optional F2.1.
- Does not mint identity for native content scripts.
- Does not mint identity for mobile (deferred).

## What comes next

- **F2.1 (optional)**: tiny F1B runner update to display `surfaceKind /
  appKind / storeKind` in the panel header. Pure read of `.diagnose()`. ~10
  lines.
- **F3**: envelope stamping. Add `exportId / sequenceNumber / sourceSyncPeerId
  / contentSha256` to outbound bundles. Additive; older readers ignore.
- See the multi-peer architecture report for the full phased roadmap (F3–F12).
