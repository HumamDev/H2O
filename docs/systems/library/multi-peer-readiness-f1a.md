# Multi-Peer Readiness — F1A (Diagnostic Analyzer)

## Status

F1A is a **pure read-only diagnostic** for the future multi-peer Studio Library
sync system. It is not part of the user-facing product. It does not change the
proven one-way Desktop → Chrome sync lane (R1–R2E, recorded in
[`desktop-chrome-sync-r2d-gate.md`](desktop-chrome-sync-r2d-gate.md)).

F1A scope:

- A single JS module: [`src-surfaces-base/studio/sync/multi-peer-diff.js`](../../../src-surfaces-base/studio/sync/multi-peer-diff.js).
- Exposes `H2O.Studio.diagnostics.multiPeerDiff(input)` — pure, synchronous,
  read-only analyzer.
- Exposes `H2O.Studio.diagnostics.collectLocalState()` — optional async helper
  that calls public store `.list()` adapters only. The analyzer does not
  depend on it.
- Not added to the userscript pack. Loaded by hand in DevTools when needed.
- No Settings UI, no persistent writes, no schema changes, no sync behavior
  changes.

F1B (the small hidden experimental Settings panel) follows once F1A output is
stable. F1A is the only thing that has landed.

## Loading the analyzer

Because F1A is intentionally not packed (so it cannot accidentally ship to
users), load it manually:

1. Open Studio in the surface you want to analyze (Desktop or Chrome).
2. Open DevTools.
3. Paste the contents of
   [`src-surfaces-base/studio/sync/multi-peer-diff.js`](../../../src-surfaces-base/studio/sync/multi-peer-diff.js)
   into the console and press Enter. The IIFE registers the namespace.
4. Confirm:

   ```js
   H2O.Studio.diagnostics.__multiPeerDiffVersion
   // -> '0.1.0-f1a'
   ```

## Running the analyzer

### Desktop (Tauri)

```js
const bundle     = await H2O.Studio.ingestion.exportFullBundle();
const localState = await H2O.Studio.diagnostics.collectLocalState();
const report     = H2O.Studio.diagnostics.multiPeerDiff({ bundle, localState });
console.log(JSON.stringify(report, null, 2));
```

`exportFullBundle()` returns the bundle **in memory** without writing
`latest.json`. `collectLocalState()` calls `.list()` on the public store
adapters — read-only.

### Chrome (MV3)

Chrome does not have a local exporter. Feed in a known bundle (for example, the
contents of a recent `latest.json` from `~/H2O Studio Sync/`):

```js
const text   = await navigator.clipboard.readText();         // paste latest.json
const bundle = JSON.parse(text);
const report = H2O.Studio.diagnostics.multiPeerDiff({ bundle });
console.log(JSON.stringify(report, null, 2));
```

### Without local state

`localState` is optional. With no `localState`, the analyzer still reports
coverage, envelope gaps, peer enumeration, and invariants. Conflict and
tombstone-candidate detection are skipped (the report records this in the
relevant `note` field).

## What the report contains

| Section | What it tells you |
|---|---|
| `inputSummary` | Bundle schema, surface, counts |
| `envelope` | Which multi-peer envelope fields are present (today: none) and explanatory notes |
| `coverage` | Per record-kind: missing IDs, timestamps, digests, source attribution |
| `peers.enumerated` | Provisional peer key for the bundle's surface (no identity is minted) |
| `peers.captureSources` | Native content-script origins (chatgpt / claude / gemini) attributed to the owning peer, **never** classified as peers |
| `tombstoneCandidates` | Records present locally but absent from the bundle |
| `conflicts` | Field-level disagreements bucketed per the F1A merge-rule table |
| `invariants` | ADR-0005 invariant check, snapshot id uniqueness, etc. |
| `readiness` | Advisory `identity / deletion / conflict` rollup (advisory only — not a gate) |

## Merge-rule classifier (F1A-approved)

| Bucket | What it covers |
|---|---|
| `merge:union` | `tagIds`, `labelIds`, FolderBinding sets, multi-head snapshots |
| `merge:visual-lww` | `color`, `icon`, `position`, view-preference fields |
| `conflict:needs-review` | `title`, `href`, `state.isSaved/isLinked/isPinned/isArchived`, `categoryId`, `projectId`, folder hierarchy, renames |
| `conflict:hard` | Same `snapshotId` with different `digest`; saved-snapshot content disagreement (e.g., `messageCount`); delete-vs-edit |

LWW is never used for chat identity metadata, source URL, saved/linked state,
or content. Same `snapshotId` with different `digest` is always `conflict:hard`.

## Peer model (F1A-approved correction)

A producer is a **sync peer** only if it owns a durable Library store and
produces its own per-peer export. Native content-script origins
(chatgpt.com / claude.ai / gemini) feed an owning peer's store and are
classified as **capture sources** attached to that peer, never as separate
peers.

The analyzer rejects `options.treatNativeExtensionsAsPeers === true` with an
explicit error.

## Field allowlist (safety)

The analyzer reads only:

- Stable IDs (`chatId`, `snapshotId`, `folderId`, `categoryId`, …)
- ISO timestamps (`createdAt`, `updatedAt`, `capturedAt`, …)
- Digests, counts (`digest`, `messageCount`)
- Source-attribution strings (`source`, `host`, `captureSource`)
- Short scalar metadata (`title`, `href`) — truncated to 80 characters when
  included as samples
- `state.*` booleans
- Foreign-key id strings and arrays (`tagIds`, `labelIds`, `categoryId`,
  `projectId`, `parentId`)
- Visual scalars (`color`, `icon`, `position`)

The analyzer **never** reads `snapshot.messages`, message bodies, or transcript
content. Conflict samples carry IDs and short scalars only.

## What F1A does not do

- Does not write to SQLite, IndexedDB, `chrome.storage`, or the filesystem.
- Does not call any Tauri plugin, `chrome.runtime`, `fetch`, or `XMLHttpRequest`.
- Does not change the bundle schema or any record schema.
- Does not mint `installId`, `physicalDeviceId`, or `syncPeerId`.
- Does not modify the R2D safety gate.
- Does not affect `~/H2O Studio Sync/latest.json` or any sync state.
- Does not register UI controls.

## Rollback

Delete `src-surfaces-base/studio/sync/multi-peer-diff.js` and this document.
No persistent state was written.

## What comes next (not implemented)

- F1B: small hidden experimental Settings panel that runs the analyzer and
  displays counts. Gated behind a runtime flag. To be approved separately.
- F2 onward: identity scaffold, envelope stamps, per-peer transport, tombstones,
  conflict UI — each its own phase with its own approval gate. See the
  multi-peer architecture report for the full phased roadmap.
