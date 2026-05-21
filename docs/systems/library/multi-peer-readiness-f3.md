# Multi-Peer Readiness — F3 (Identity-Aware Envelope Stamping)

## Status

F3 adds **additive identity-aware envelope stamping** to outbound bundles.
Producer-side only. Bundle schema stays `h2o.studio.fullBundle.v2`. Chrome
importer is not modified. The R-phase Desktop → Chrome one-way lane continues
to work unchanged.

F3 is the first phase that edits an R-phase file
(`src-surfaces-base/studio/ingestion/export-bundle.tauri.js`). The edits are
purely additive — new constants, new fields on the envelope, new fields on
the result object. Existing fields and existing write semantics are preserved
verbatim.

## What F3 stamps

### Identity-only fields (added by `exportFullBundle()`)

`exportFullBundle()` is the in-memory bundle builder. Used by both the
disk-writing path and by F1B's diagnostic runner. It must NOT look like a real
export event. It adds only safe source-identity stamps:

| Field | Source | Notes |
|---|---|---|
| `sourceSyncPeerId` | F2 `H2O.Studio.identity.get().syncPeerId` | Canonical peer identifier. Embeds installId in its tail by construction. |
| `sourceSurfaceKind` | F2 `H2O.Studio.identity.get().surfaceKind` | e.g. `studio-desktop` |
| `sourceAppKind` | F2 `H2O.Studio.identity.get().appKind` | e.g. `tauri-desktop` |
| `sourceStoreKind` | F2 `H2O.Studio.identity.get().storeKind` | e.g. `sqlite` |
| `exportSchemaVersion` | constant `'h2o.studio.export-envelope.v1'` | Marks the F3 stamping convention. Bundle schema stays v2. |

If F2 identity is unavailable (module didn't load, init failed, surface not
recognized), `exportFullBundle` skips the four source-* fields and stamps only
`exportSchemaVersion`. Defensive — never throws.

### Event fields (added by `exportLatestSyncBundle()` only)

`exportLatestSyncBundle()` is the disk-writing path. It is the **only**
function that mints a real export event, increments the sequence counter,
and persists the log. It calls `exportFullBundle()` first, then patches in:

| Field | Source | Notes |
|---|---|---|
| `exportId` | UUIDv4 minted by `H2O.Studio.exportLog.recordExport()` | Fresh per export. |
| `sequenceNumber` | Monotonic counter, increments on every successful log write | Starts at 1. Gaps tolerated if a file write fails after the log persisted. |
| `previousExportId` | Prior `lastExportId` from the log | `null` on the first-ever export. |
| `contentSha256` | SHA-256 of the bundle JSON **with** `exportSchemaVersion + source* + exportId + sequenceNumber + previousExportId` but **without** `contentSha256` itself, serialized via `JSON.stringify(bundle, null, 2) + '\n'`, formatted as `'sha256:<hex>'` | Lets consumers verify content integrity by stripping the field and rehashing. |

**Deliberately NOT stamped** (deferred or rejected):

- `sourceInstallId` — redundant with `sourceSyncPeerId` (which embeds installId in its tail). Per F3 corrections, do not duplicate.
- `sourcePhysicalDeviceId` — F2 documented best-effort/diagnostic-only; no protocol decision branches on it.
- `displayName` — human label; defer until a consent path exists post-F6.
- `parentExportIds` — requires cross-peer awareness; deferred to F4+.
- `tombstones[]` — F5.

## Function contract

| Function | Stamps source-identity? | Stamps event fields? | Mutates export-log? | Writes file? |
|---|---|---|---|---|
| `H2O.Studio.ingestion.exportFullBundle()` | yes | **no** | **no** | no |
| `H2O.Studio.ingestion.exportLatestSyncBundle()` | yes (via exportFullBundle) | yes | yes | yes |

This contract is the F3 "preview-vs-event" boundary. F1B's diagnostic runner
calls `exportFullBundle()` and is therefore never misclassified as a real
export event.

## Storage

| Key | Owner | Mutated by |
|---|---|---|
| `'h2o:sync:peer-identity:v1'` | F2 | F2 identity init / setDisplayName |
| **`'h2o:sync:export-log:v1'`** | **F3 (new)** | **only `exportLatestSyncBundle()`** |

Persistence shape of the export log:

```jsonc
{
  "schema":          "h2o.studio.export-log.v1",
  "syncPeerId":      "<surface>:<app>:<store>:<installId>",
  "lastExportId":    "<uuidv4>" | null,
  "lastExportedAt":  "<ISO>" | "",
  "sequenceNumber":  <integer ≥ 0>,
  "exportHistory":   [
    { "exportId", "sequenceNumber", "exportedAt", "outboundPath" }
  ]
}
```

`exportHistory[]` is capped at `EXPORT_HISTORY_MAX = 50` entries; oldest are
evicted on overflow. No `contentSha256` in log entries — it lives on the
envelope only.

## Atomicity

Order on every `exportLatestSyncBundle()`:

1. Build the bundle (`exportFullBundle`) — pure in-memory.
2. **Persist** the new export log entry (`exportLog.recordExport`). Sequence
   consumed here.
3. Stamp `exportId / sequenceNumber / previousExportId` onto the bundle.
4. Compute `contentSha256` over the patched bundle (without `contentSha256`).
5. Stamp `contentSha256`.
6. Write the bundle file atomically (`.tmp` → rename).

If step 6 fails, the sequence number is "burned" — no rollback. Gaps in
sequence are tolerable; reuse is not.

## Compatibility

- Bundle schema stays `'h2o.studio.fullBundle.v2'`. No v3.
- Chrome's `folder-import.mv3.js` validator checks `bundle.schema === 'h2o.studio.fullBundle.v2'` only; extra envelope fields are ignored by the merge importer.
- Chrome's `bundle.exportId` slot, previously always `undefined`, is now populated. Chrome already stores it as `state.lastAppliedExportId`; behavior is unchanged.
- The file-level SHA stored by Chrome as `state.lastChecksum` is independent of the new envelope-level `contentSha256` (different scopes — file body vs bundle content). Both coexist.
- Older Chrome dist (loaded by some users before F3 propagates) simply ignores the new fields. Forward-compatible.

## Compatibility verification

To verify the F3 envelope on the consumer side without modifying Chrome:

```js
// In Chrome Studio DevTools after syncing a freshly F3-stamped bundle:
const state = await H2O.Studio.sync.folder.diagnose();
state.lastAppliedExportId;     // now a real UUIDv4 (was undefined before F3)
state.lastSyncResult;          // unchanged merge result; row counts unchanged
```

To verify `contentSha256` on any consumer:

```js
const text = '… read latest.json bytes …';
const bundle = JSON.parse(text);
const saved = bundle.contentSha256;
delete bundle.contentSha256;
const preimage = JSON.stringify(bundle, null, 2) + '\n';
const expected = 'sha256:' + (await sha256Hex(preimage));  // same helper as the exporter
expected === saved;            // → true
```

(Producer serializes the preimage exactly the same way the writer formats the
file: `JSON.stringify(bundle, null, 2) + '\n'`.)

## Rollback

- Revert the edits in `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`.
- Delete `src-surfaces-base/studio/sync/export-log.js`.
- Revert the `<script>` tag in `studio.html` and the two pack-studio entries.
- Delete this doc.
- Optional cleanup: `chrome.storage.local.remove('h2o:sync:export-log:v1')`.

The on-disk `~/H2O Studio Sync/latest.json` keeps the F3 fields until the next
export rewrites it. Older Chrome readers ignore them. A single
`await H2O.Studio.ingestion.exportLatestSyncBundle()` after rollback writes a
pre-F3 envelope and overwrites the file.

## What F3 does not do

- Does not change `bundle.schema` (stays v2).
- Does not add `sourceInstallId`, `sourcePhysicalDeviceId`, `displayName`, `parentExportIds`, or `tombstones[]` to the envelope.
- Does not modify `folder-import.mv3.js`, `auto-export.tauri.js`, `folder-sync.tauri.js`, `import-bundle.tauri.js`, `multi-peer-runner.js`, `multi-peer-diff.js`, `peer-identity.js`, `studio.js`, or `studio.css`.
- Does not introduce a per-peer transport (`/devices/<syncPeerId>/latest.json`) — that is F4.
- Does not propagate tombstones, run conflict apply, or do bidirectional sync.
- Does not modify Chrome's importer behavior beyond it now seeing populated fields.
- Does not run on Mobile or WebDAV.

## What comes next

- **F4**: per-peer transport (`/devices/<syncPeerId>/latest.json`) and Chrome-side `lastAppliedSequenceNumber` for replay protection.
- **F5**: tombstone data model + envelope `tombstones[]` array.
- **F6**: conflict review queue.
- See the multi-peer architecture report for the full phased roadmap.
