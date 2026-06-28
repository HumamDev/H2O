# Saved Chat Archive — Phase F.3 Materializer Runtime Smoke

Date: 2026-06-28

Status: **F.3 MATERIALIZER RUNTIME SMOKE — PASSED**

Lane: Chat Saving Architecture (Phase F — materialization trigger runtime proof).

This slice runs the first **real** end-to-end execution of the F.2 Desktop
operator action: it drives a persisted `validated` saved-chat archive request
through the existing D.2C materializer in Desktop Studio / Tauri DevTools,
producing a real saved-chat package on disk, and proves idempotency on re-run.
A Tauri capability ACL blocker (dev-server origin) was found and fixed with the
minimum scoped capability change.

## Baseline

```text
a2a3cb7  feat(studio): add desktop archive materializer action   (F.2)
```
(HEAD had advanced to `0609ef4` via parallel sync-lane commits when F.3 landed;
F.3 commits on top of current HEAD. No F.2 / materializer / writer code changed.)

## Selected request (safe target)

| Field | Value |
|---|---|
| requestId | `f7cd514a-f35d-4ddf-ae0a-c3356ecf44a9` |
| source_surface | `chrome-studio` (Chrome-originated intent; Desktop re-resolves + writes) |
| title | Half Squats and Acceleration |
| studio_chat_id | `69de12dc-b7dc-838c-a553-916422265e5a` |
| snapshot_id | `snap_1778518803736_g8qie3rz` (exists in `snapshots`, 11 messages, digest present) |
| pre-state status | `validated` |
| predicted package | `archive/packages/69de12dc-b7dc-838c-a553-916422265e5a.h2ochat` (absent before run) |

A real captured chat (not a synthetic fixture) was chosen so the smoke proves
real materialization; its package did not previously exist on disk.

## Pre-fix blocker

The materializer reached its first SQL call and failed. Diagnostic from Desktop
Studio / Tauri DevTools:

```text
href:        http://127.0.0.1:1430/studio.html?h2oSmokeBridge=folder-sync-rc#/library/folders
origin:      http://127.0.0.1:1430
windowLabel: main      webviewLabel: main      invokeType: function
load:    Command plugin:sql|load   not allowed by ACL
select:  Command plugin:sql|select not allowed by ACL
execute: Command plugin:sql|execute not allowed by ACL
```

The F.2 API was present and Desktop-capable (`hasApi:true`, `isDesktopCapable:true`)
and window/webview labels were correct (`main/main`) — so it was **not** a
wrong-window or code issue. **All** `plugin:sql|*` commands were ACL-denied.

## Root cause

Under `tauri dev`, the Desktop WebView is served from a **remote dev-server
origin** `http://127.0.0.1:1430`, not `tauri://localhost`. In Tauri v2, a
capability only governs a remote origin if that origin is listed in the
capability's `remote.urls` scope (URLPattern standard). Neither Desktop
capability declared a `remote` scope, so the dev-origin WebView matched **no**
capability and had no access to the IPC layer for those commands. (This also
explains the earlier paradox where the compiled binary contained the SQL grants
yet the ACL still denied them — the grants were scoped to local/`main` only and
never applied to the remote dev origin.)

## Capability fix (minimum, scoped)

Added the same dev-only `remote` scope to both Desktop capabilities:

```json
"remote": {
  "urls": ["http://127.0.0.1:1430/*", "http://localhost:1430/*"]
}
```

- **`capabilities/default.json`** — required for `plugin:sql|load/select/execute`
  (the materializer's DB read + status transitions) and the app's boot SQL.
- **`capabilities/archive-cas.json`** — required for the package **write** path:
  the writer uses `plugin:fs|exists/mkdir/write_file/read_file` under
  `$APPLOCALDATA/archive`, which only `archive-cas.json` grants. Without this the
  SQL would succeed but the write would be ACL-denied, so the smoke could not
  reach `written`.

No new permissions were added — only the **existing** Desktop permissions were
extended to the dev-server origin. The materializer / writer / scanner / store
code was not touched.

### Why Chrome authority did not expand

- `remote.urls` contains **only** the two localhost dev-server URLs. There is
  **no** `chrome-extension://` origin and no broadening to arbitrary domains.
- The Chrome MV3 extension has **no Tauri runtime** (`__TAURI_INTERNALS__`
  undefined), so it cannot invoke `plugin:sql` / `plugin:fs` at all — the Tauri
  capability ACL governs only the Desktop WebView.
- In production / installed Desktop builds the frontend loads over `tauri://`
  (local), so the `remote` scope never matches and is **inert**. The change
  affects the Desktop **dev** WebView only.

## Post-fix SQL diagnostic (after rebuild)

```text
origin:  http://127.0.0.1:1430
load:    ok
select:  ok   — SELECT 1 AS ok -> [{ ok: 1 }]
execute: ok
```

All three SQL commands are now permitted at the dev origin; the ACL denial is gone.

## Materializer runtime result — first run (`written`)

Invoked the F.2 operator path
`H2O.Studio.archiveMaterializerAction.materializeRequest({ requestId })`:

```text
ok:                  true
status:              written
previousStatus:      validated
packageWriteDeferred:false
chromeRuntime:       false
syncTransport:       false
package.packagePath: archive/packages/69de12dc-b7dc-838c-a553-916422265e5a.h2ochat
package.schemaVersion:  1
package.payloadVersion: 1
package.contentHash: sha256-b47d293837a5804df3b200cb9feff8b373ca2703ffff855e3152790b598cb634
package.snapshotId:  snap_1778518803736_g8qie3rz
package.writtenAt:   2026-06-28T17:01:00.039Z
```

## Materializer runtime result — second run (`already-written`, idempotent)

```text
ok:                  true
status:              already-written
previousStatus:      written
package.packagePath: (same)  archive/packages/69de12dc-b7dc-838c-a553-916422265e5a.h2ochat
package.contentHash: (same)  sha256-b47d293837a5804df3b200cb9feff8b373ca2703ffff855e3152790b598cb634
package.snapshotId:  (same)  snap_1778518803736_g8qie3rz
package.writtenAt:   (same)  2026-06-28T17:01:00.039Z
packageWriteDeferred:false   chromeRuntime:false   syncTransport:false
```

Second run returned the persisted package with **no** writer call and **no**
change to `packagePath` / `contentHash` / `writtenAt` — idempotent, no duplicate.

## Disk / package proof (verified independently from the terminal)

Package root: `~/Library/Application Support/org.h2o.studio.desktop/archive/packages/69de12dc-b7dc-838c-a553-916422265e5a.h2ochat` (created 2026-06-28 19:01 local = 17:01 UTC, matching `writtenAt`).

```text
present:  manifest.json  snapshot.json  chat.md  chat.html
assets/:  absent (manifest assets: []) — correct: text-only chat, no captured assets

independently recomputed sha256 vs manifest file descriptors:
  snapshot.json  b47d293837a5804df3b200cb9feff8b373ca2703ffff855e3152790b598cb634  == manifest.files.snapshot.sha256  ✓
  chat.md        6dfc338a932b1360835c99825421e9dce63e60f70e6be6a281b06aaf917f5f4a  == manifest.files.markdown.sha256  ✓
  chat.html      9f62822773f196a2eff18e6d9a7043faaf34a293f33816a6667fae1c7349e256  == manifest.files.html.sha256      ✓
```

**Hash-field semantics confirmed:** the package `contentHash`
(`sha256-b47d2938…b598cb634`) equals `sha256(snapshot.json)` — i.e. the SHA-256
of the canonical, authoritative snapshot payload — and matches both the
materializer result and `manifest.contentHash`. `chat.md` / `chat.html` are
derived (`derivedFrom: snapshot.json`) and carry their own file hashes.

manifest.json identity / provenance:
```text
schema: h2o.savedChatPackage   schemaVersion: 1
packageId: pkg_snap_1778518803736_g8qie3rz_b47d293837a5
chatId: 69de12dc-b7dc-838c-a553-916422265e5a    snapshotId: snap_1778518803736_g8qie3rz
store.authority: desktop-sqlite-store
provenance.sourceOfTruth: desktop-sqlite-store    provenance.projectionOnly: true
```

## DB proof (`saved_chat_archive_requests`, read-only)

```text
request_id  f7cd514a-f35d-4ddf-ae0a-c3356ecf44a9
status      written            (was: validated)
snapshot_id snap_1778518803736_g8qie3rz
updated_at  2026-06-28T17:01:00.039Z

meta_json.materialization:
  packagePath:          archive/packages/69de12dc-b7dc-838c-a553-916422265e5a.h2ochat
  schemaVersion:        1
  payloadVersion:       1
  contentHash:          sha256-b47d293837a5804df3b200cb9feff8b373ca2703ffff855e3152790b598cb634
  snapshotId:           snap_1778518803736_g8qie3rz
  writtenAt:            2026-06-28T17:01:00.039Z
  processingStartedAt:  2026-06-28T17:01:00.004Z
  processingFinishedAt: 2026-06-28T17:01:00.039Z
  overwrite:            false
```

- Row transitioned `validated → written`; `meta_json.materialization` carries the
  full package object (packagePath / contentHash / snapshotId / writtenAt) — and
  all values match the on-disk manifest exactly.
- **No `failed` / `db-unavailable` / stuck-`writing` row** remains for this
  request, chat, or snapshot. The earlier ACL-blocked attempts failed at the
  initial SELECT (queue read) before any state transition, so they left no DB
  residue.
- Status distribution moved cleanly by exactly one request:
  `validated 58→57`, `written 3→4` (others unchanged) — confirming exactly one
  materialization and no collateral writes.

## Archive Health / package diagnostics proof

The runtime Archive Health card (`saved-chat-archive-diagnostics.tauri.js`,
`H2O.Studio.ingestion.diagnoseSavedChatArchiveV1`) is **Tauri-webview-only**
(`plugin:fs`-based) and cannot run from the terminal; there is no node-runnable
inventory script. Its C5.1/C5.2/C5.3 checks were therefore performed directly on
disk with identical semantics:

- **C5.1 inventory** — the package is present under `archive/packages` and would
  be enumerated. ✓
- **C5.2 hash validation** — all `REQUIRED_FILES`
  (`manifest.json, snapshot.json, chat.md, chat.html`) are present and every
  recomputed sha256 matches its manifest descriptor (no hash mismatch). ✓
- **C5.3 asset validation** — `manifest.assets: []` and no `assets/` directory →
  no missing/dangling assets. ✓

→ Archive Health would classify this package as **packagesOk** (0 blockers,
0 warnings). **Limitation:** this is the on-disk equivalent of the live card's
checks; an operator may optionally confirm in Desktop DevTools (read-only, no
re-materialization) with:
```js
await H2O.Studio.ingestion.diagnoseSavedChatArchiveV1();
```

## Validation results

```text
JSON parse + remote schema-valid (urls: string[], CapabilityRemote)   default.json + archive-cas.json OK
validate-saved-chat-archive-materializer-trigger-v1.mjs   PASS 24 checks
validate-saved-chat-archive-materializer-v1.mjs           all 14 checks passed
validate-studio-archive-health-ui.mjs                     all 19 checks passed
validate-saved-chat-archive-status-v1.mjs                 PASS 19 checks
validate-saved-chat-archive-status-badge-v1.mjs           PASS 30 checks
git diff --check / --cached --check                       clean
node --check                                              N/A (only JSON capability files changed)
```

## Files changed

- `apps/studio/desktop/src-tauri/capabilities/default.json` (added dev-only `remote` scope)
- `apps/studio/desktop/src-tauri/capabilities/archive-cas.json` (added dev-only `remote` scope)
- `release-evidence/2026-06-24/saved-chat-archive-phase-f3-materializer-runtime-smoke.md` (this note)

No materializer / scanner / package writer / projector / CAS / store / Chrome /
appearance / ribbon / sync code was modified. No `studio.js` / `S0F0j` / `S0F1j`
edits.

## Boundaries held

- **No Chrome writes / no Chrome authority expansion** — `remote.urls` is the two
  localhost dev URLs only; no `chrome-extension://` origin; Chrome has no Tauri
  runtime and performs no SQL/CAS/package writes. Package `provenance` records
  `sourceOfTruth: desktop-sqlite-store`, `projectionOnly: true`.
- **Desktop remained authoritative** — the package was written solely by the
  Desktop writer from the resolved Desktop `snapshotId`; Chrome request content
  was never used as package source.
- **No scanner auto-trigger** — materialization was an explicit operator action
  for one `requestId`; the scanner (`scanSavedChatArchiveRequestInboxV1`) was not
  called and its enqueue-only behavior is unchanged.
- **No watcher / poller / daemon** — the fix is capability JSON only; no timers,
  intervals, or background loops were added.
- **No package overwrite** — `overwrite:false` throughout (result + `meta_json`);
  the second run returned `already-written` with identical `contentHash` /
  `packagePath` and performed no rewrite.
- **No sync / WebDAV / cloud / native messaging / localhost relay** — the
  capability change scopes existing SQL + app-owned archive-fs permissions to the
  dev origin; it adds no new transport or permission.
- **No `studio.js` / `S0F0j` / `S0F1j` edits; no unrelated dirty files staged.**

## Verdict

**F.3 MATERIALIZER RUNTIME SMOKE — PASSED.** The F.2 Desktop operator action
materialized a real `validated` request into a real, hash-consistent saved-chat
package (`written`), the DB row and `meta_json.materialization` reflect it, the
on-disk package passes Archive Health's hash/asset checks, and a second run is
idempotent (`already-written`, no duplicate). The runtime blocker was a Tauri v2
capability `remote.urls` gap for the dev-server origin, fixed with the minimum
scoped change to the two Desktop capabilities; Chrome authority did not expand
and Desktop remained the sole package writer.

## Recommended next step after F.3

The end-to-end Desktop materialization path is now proven. The conditional Chrome
`queued-on-desktop` vs `package-written` badge/receipt distinction remains
**F.4**, behind its own contract amendment (Chrome stays intent/read-back only;
no Chrome SQL/CAS authority). Separately, the dev-origin `remote` scope is a
`tauri dev` convenience and is inert in production — if the dev server port
(1430) changes, update `remote.urls` accordingly.
