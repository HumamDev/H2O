# Multi-Peer Readiness — F1B (Hidden Gated Runner)

## Status

F1B is a **hidden, gated, counts-only diagnostic** that wraps the F1A analyzer
with live bundle + localState inside a running Studio session. It is not a
user feature. It does not change the proven R1–R2E sync lane.

F1B scope:

- Adds [`src-surfaces-base/studio/sync/multi-peer-runner.js`](../../../src-surfaces-base/studio/sync/multi-peer-runner.js) — runner module.
- Adds both the F1A analyzer and the F1B runner to the userscript pack ([`tools/product/studio/pack-studio.mjs`](../../../tools/product/studio/pack-studio.mjs)).
  Both modules ship dormant — see the gate below.
- No Settings UI is added. No menu link. No discoverable entry point.
- No writes, no schema changes, no R-phase behavior changes, no identity minting,
  no bidirectional sync, no tombstone propagation.

F2 (peer identity scaffold) follows once F1B has produced at least one real
conflict-bucket / tombstone-candidate data point.

## Double gate (both required)

The runner panel mounts **only** when both conditions hold:

| # | Condition |
|---|---|
| 1 | `H2O.flags && H2O.flags.experimentalMultiPeer === true` (in-memory only — never persisted) |
| 2 | `location.hash === '#/dev/multi-peer-readiness'` |

A refresh resets the flag. Setting only the flag without the hash, or only the
hash without the flag, mounts nothing.

The runner registers a `hashchange` listener at module load. The listener body
re-checks the gate predicate every fire, so a stale listener is harmless.

## Developer usage

1. Open Studio on Desktop (Tauri) or Chrome (MV3).
2. Open DevTools.
3. Set the flag:

   ```js
   H2O.flags = H2O.flags || {};
   H2O.flags.experimentalMultiPeer = true;
   ```

4. Navigate to the hidden route:

   ```js
   location.hash = '#/dev/multi-peer-readiness';
   ```

5. A panel appears top-right. Click **Run readiness check**.

To dismiss: navigate to any other hash, or refresh.

## What the panel shows — counts only

The runner renders **only**:

- Surface, analyzer version, runner version.
- Envelope gaps: `present` / `missing` per envelope field.
- Coverage: per-kind `total / missing createdAt / missing updatedAt / missing source` counts.
- Tombstone candidates: total + per-kind counts.
- Conflict counts: one number per F1A merge-rule bucket.
- Invariant pass/fail flags + issue count.
- Readiness rollup: `identity / deletion / conflict` advisory strings.

It does **not** render:

- Record IDs, chat IDs, snapshot IDs, folder/category/label/tag IDs.
- Titles, URLs, source URLs.
- Conflict sample arrays.
- Snapshot digests as strings.
- Any record content or transcript text.

The DOM is constructed with `createElement` + `textContent` only. There is no
`innerHTML`, no `outerHTML`, no template-string interpolation of report data
into DOM.

## What the runner does on "Run"

1. `H2O.Studio.ingestion.exportFullBundle()` — in-memory only. Does **not**
   call `exportLatestSyncBundle()` (the file writer).
2. `H2O.Studio.diagnostics.collectLocalState()` — read-only `.list()` calls
   against the Tauri store adapters on Desktop, or whichever adapters are
   present.
3. `H2O.Studio.diagnostics.multiPeerDiff({ bundle, localState })` — pure
   synchronous analyzer.
4. Renders counts from the resulting report into the panel.

If `exportFullBundle()` is unavailable on the current surface (Chrome MV3 has
no in-memory exporter today), the Run button reports
`bundle source unavailable on <surface>` and does nothing else.

## What F1B does **not** do

- Does not write to `chrome.storage`, `localStorage`, `sessionStorage`, SQLite,
  IndexedDB, or the filesystem.
- Does not call `exportLatestSyncBundle()` — only the in-memory exporter.
- Does not mutate Studio store data.
- Does not register UI controls outside its own dynamically-mounted host div.
- Does not edit `studio.js`, `studio.html`, or any R-phase sync file.
- Does not persist the gate flag, the report, or any state. Refresh = reset.
- Does not surface any record content in the DOM.

## Discovery / safety posture

| Layer | Why it is safe |
|---|---|
| **No discoverable entry point.** | The hash route name lives in this file and in [`multi-peer-runner.js`](../../../src-surfaces-base/studio/sync/multi-peer-runner.js) only. No menu link, no settings tab, no banner references it. |
| **In-memory flag.** | The gate flag is never read from a persistent store and never written. Setting it requires DevTools access. |
| **Double gate.** | Even with the flag, the hash route must be active. Even with the hash route, the flag must be set. |
| **Counts only.** | If the panel mounts, it cannot leak content because content never enters the DOM. |
| **Refresh clears.** | The flag is in-memory; a refresh resets it and unmounts the panel. |

**Do not** link to `#/dev/multi-peer-readiness` from any user-visible UI in
future commits. F1B's safety depends on the route being undiscoverable to
non-developers.

## Rollback

1. Revert the pack-studio entries (two lines added in each of `SOURCE_FILES`
   and `OUT_FILES`).
2. Delete `src-surfaces-base/studio/sync/multi-peer-runner.js`.
3. Delete this doc.

No persistent state was ever written. Rollback is purely file-level.

## What comes next (not implemented)

- **F2** — peer identity scaffold: mint `installId` / `syncPeerId` and persist
  them on each peer. Additive; no envelope change yet.
- **F3** — additive envelope stamps (`exportId`, `sequenceNumber`,
  `sourceSyncPeerId`, `contentSha256`).
- See the original multi-peer architecture report for the full phased roadmap.
