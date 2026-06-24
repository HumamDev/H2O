# Saved Chat Archive Diagnostics - C5 Milestone Closure

Date: 2026-06-24

Status: C5 CURRENT MILESTONE CLOSED

Lane: Chat Saving Architecture (Phase C). This is a docs/evidence-only closure
note. It adds no runtime code, no validators, and no UI/sync/Chrome/import work.
It formally closes the current C5 milestone after C5.4A.

## Closed C5 chain

| Slice | Scope | Commit |
|---|---|---|
| C5.1 + C5.2 | Archive/package inventory + manifest/snapshot/hash diagnostics | `e5c6aa3 feat(studio): add saved chat archive diagnostics` |
| C5.3 | Package asset / `assetRefs` / renderer / live CAS diagnostics | `2f0b5dc feat(studio): add saved chat archive asset diagnostics` |
| C5.3 evidence | Asset diagnostics runtime smoke (PASSED) | `c8e21d4 docs(studio): record saved chat archive asset diagnostics smoke` |
| C5.4A | Package-centric DB reconciliation diagnostics | `85b1741 feat(studio): add saved chat archive db diagnostics` |
| C5.4A evidence | DB diagnostics runtime smoke (PASSED) | `65c4d0e docs(studio): record saved chat archive db diagnostics smoke` |

## What is now proven

The read-only, Desktop-only saved-chat archive diagnostics
(`H2O.Studio.ingestion.diagnoseSavedChatArchiveV1` /
`validateSavedChatPackageV1` / `listSavedChatArchivePackagesV1` /
`diagnoseSavedChatArchiveCapabilitiesV1`) now cover, end to end:

- Desktop-only archive/package inventory under `$APPLOCALDATA/archive/packages`.
- v1 / v2 package detection (`schemaVersion` / `payloadVersion`).
- required package file presence (`manifest.json`, `snapshot.json`, `chat.md`,
  `chat.html`).
- manifest and snapshot JSON parseability.
- snapshot hash validation (`files.snapshot.sha256` vs stored bytes).
- v1 / v2 `contentHash` validation (v2 = canonical
  `{ snapshot, assets:[sorted] }` descriptor).
- package asset validation (descriptor shape, file existence, byte length, hash).
- `assetRefs` validation against `manifest.assets[]`.
- renderer `data:image` residue checks and package-relative renderer asset
  reference checks.
- live CAS presence diagnostics (read-only `exists`/`describe`).
- package-centric DB reconciliation (read-only `store.chats.get` /
  `store.snapshots.get` / `store.snapshots.listByChat` /
  `store.assets.listBySnapshot`).
- store asset registry comparison vs package manifest assets.
- aggregate archive health counts and the warning/blocker classification model.

## Runtime evidence referenced

- C4.4 package writer smoke passed: `df1c5de`.
- C5.3 asset diagnostics smoke passed: `c8e21d4`.
- C5.4A DB diagnostics smoke passed: `65c4d0e`.

The C5.4A smoke observed a healthy real-Desktop archive of 13 packages
(3 v1 / 10 v2), `archiveStatus: ok`, all DB-drift counts `0`, and a DB checks
summary of `passed: 13, warnings: 0, failed: 0`
(`release-evidence/2026-06-24/saved-chat-archive-db-diagnostics-runtime-smoke.md`).

## Architectural conclusions

- Saved packages are **portable preservation projections**, not a second live
  database.
- **Package corruption is blocker-level** (missing/invalid files, bad JSON,
  snapshot/contentHash mismatch, broken/missing package asset bytes,
  `data:image` residue).
- **DB / CAS drift is diagnostic warning-level** (missing DB chat/snapshot,
  stale package, store asset registry mismatch, live CAS missing) and never makes
  a structurally valid package invalid.
- C5 diagnostics are **read-only**: no repair, import, recovery, delete, or
  overwrite paths were added.
- No UI, sync, Chrome, or user-folder export/save dialog work was added.

## Explicitly deferred (out of scope for this milestone)

- C5.4B / C5.5 full DB-snapshot inventory.
- `missing-package-for-db-snapshot` scanning.
- drift-case destructive / controlled-fixture smoke.
- repair / import / recovery.
- DB rebuild from package; package rebuild from DB.
- archive health UI dashboard.
- sync transport integration.
- Chrome implementation.
- user-folder export / save dialog.
- CAS garbage collection / refcount repair.

## Next future slice

C5.4B / C5.5 should be handled later as a separate clean slice if needed, focused
on full **DB-centric** missing-package inventory (scanning DB snapshots for which
no package exists) and drift-case diagnostics against a controlled fixture. It
remains read-only diagnostics; any repair/rebuild belongs to a distinct,
separately-reviewed phase.

## Closure verdict

Saved Chat Archive Diagnostics
C5.1 / C5.2: Closed
C5.3: Closed
C5.4A: Closed
C5 current milestone: CLOSED (read-only diagnostics complete; C5.4B/C5.5 deferred)
