# Saved Chat Archive — Phase G.3 Bounded Batch Runtime Smoke

Date: 2026-06-29

Status: **G.3 BOUNDED BATCH RUNTIME SMOKE — PASSED**

Lane: Chat Saving Architecture (Phase G — automatic scanner-to-materializer
trigger policy).

This slice runs the first **real** end-to-end execution of the G.2 bounded
"Materialize validated" batch action in Desktop Studio / Tauri DevTools: a tiny,
deterministic, safe `limit:1` batch materialized one real `validated` request into
a real `.h2ochat` package, verified across disk / DB / manifest / diagnostics, and
proven idempotent.

## Baseline

```text
558a653  docs(studio): define archive auto materialization trigger contract   (G.0)
0d99931  test(studio): validate archive auto materialization trigger contract (G.1)
23dd24d  feat(studio): add bounded archive materialize validated action        (G.2)
```

Evidence/docs only — no runtime/validator/capability change in G.3.

## Selected validated row (deterministic + safe)

| Field | Value |
|---|---|
| requestId | `ee16950d-bf65-481b-a4fd-1ff5d053d2ff` |
| title | ☎️ Investment in AI Tools |
| studio_chat_id | `69f0c5f3-30c4-83eb-9240-26331d09532b` |
| snapshotId | `snap_1778516336177_wy9txv06` (exists, 10 messages, digest `929078217d53ea73…`) |
| pre-state status | `validated` (`meta_json.phase=D.2B`, `packageWriteDeferred:true`) |
| predicted package | `archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat` (**absent** before batch) |

**Why `limit:1` was deterministic and safe.** The batch lists validated rows via
`listSavedChatArchiveRequestsV1({ status:'validated', limit:1 })`, i.e.
`ORDER BY updated_at DESC, received_at DESC LIMIT 1`. Row `ee16950d` has
`updated_at = received_at = 2026-06-28T11:26:33.808Z`, the **strict, unique
maximum** among all validated rows (a tie-count query returned exactly `1`), so
`limit:1` deterministically targets only it. Its snapshot exists and its package
was absent → a clean `written`. Rows #2/#3 in batch order are synthetic test chats
(`c4_4_pkg_v2_smoke_…`) whose packages **already exist**, so `limit:2` would have
produced a `failed` (package-already-exists); `limit:1` was therefore the correct,
clean choice.

## Runtime (Desktop Studio / Tauri DevTools)

### Stale-dist discovery + fix

The initial API probe showed the running dev build was serving a **pre-G.2 dist**:

```text
hasApi: true   hasSingle: true   hasBatch: false   served module version: 0.1.0-phase-f-2
```

`materializeValidatedBatch` (G.2) was absent because the dev server's `dist/` had
not been re-packed since the G.2 commit. Fix (frontend re-pack only; no runtime
code change):

```text
node tools/product/studio/pack-studio.mjs
```

After restart/reload the probe confirmed the G.2 build:

```text
origin: http://127.0.0.1:1431   hasBatch: true   hasSingle: true   isDesktopCapable: true
```

### Capability / FS probes (pre-batch)

```text
plugin:sql|load    ok
plugin:sql|select  ok
diagnoseSavedChatArchiveV1 exists -> ok:true, status:"ok", packageCount: 17   (before batch)
```

> Note (reproducibility, non-blocking): the dev origin observed was port **1431**,
> while the **committed** capability `remote.urls` covers `127.0.0.1:1430` /
> `localhost:1430` only (verified clean — G.3 did not modify capabilities). SQL/FS
> succeeded on 1431 in the operator's running binary, so its compiled ACL admitted
> 1431, but that is not reflected in committed source. For a clean reproduction the
> dev server should be pinned to 1430 (or `remote.urls` extended to the actual dev
> port) — a future capability change, out of G.3's evidence-only scope.

### Batch first run — `materializeValidatedBatch({ limit:1 })`

```text
ok: true   desktop: true   limit: 1   total: 1   attempted: 1
counts: { written:1, already-written:0, failed:0, not-eligible:0,
          needs-desktop-snapshot:0, db-unavailable:0, not-found:0, other:0 }
results: [ { requestId: "ee16950d-bf65-481b-a4fd-1ff5d053d2ff", status: "written", ok: true } ]
```

### Idempotency — direct `materializeRequest({ requestId: ee16950d… })`

After the batch, `ee16950d` is `written` (no longer `validated`), so re-running the
*batch* would select the next validated row (`de9b4c1f`, package already exists →
would `fail`). Per the G.3 plan, idempotency was proven with the **direct
materializer call** on the same `requestId`, which also surfaces the full `package`
object + flags the batch summary's per-row results do not carry:

```text
ok: true   status: already-written   previousStatus: written
packageWriteDeferred: false   chromeRuntime: false   syncTransport: false
package.packagePath: archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat
package.schemaVersion: 1   package.payloadVersion: 1
package.contentHash: sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec
package.snapshotId: snap_1778516336177_wy9txv06
package.writtenAt: 2026-06-29T09:21:06.082Z   error: null
```

Idempotent: the persisted package was returned with **no** writer call and **no**
change to `packagePath`/`contentHash`/`writtenAt` — no duplicate package.

## Disk / package proof (verified independently from the terminal)

Package root: `~/Library/Application Support/org.h2o.studio.desktop/archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat` (created 2026-06-29 11:21 local = 09:21 UTC, matching `writtenAt`).

```text
present:  manifest.json  snapshot.json  chat.md  chat.html
assets/:  absent (manifest assets: []) — correct: text-only chat, no captured assets

independently recomputed sha256 vs manifest file descriptors:
  snapshot.json  fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec  == manifest.files.snapshot.sha256  ✓
  chat.md        55539182331c4b877f798501d892652035286fdc7d66b65c89f62d8831a7431d  == manifest.files.markdown.sha256  ✓
  chat.html      ec6147f562c6a4ee308091c1ad19d067f60867467b1fbaa09c450108066b5e53  == manifest.files.html.sha256      ✓

package count: 17 -> 18  (exactly +1)
```

**Hash-field semantics:** the package `contentHash`
(`sha256-fe608c13…589a8ec`) equals `sha256(snapshot.json)` — the SHA-256 of the
canonical, authoritative snapshot payload — and matches the materializer result,
`manifest.contentHash`, and the DB `meta_json.materialization.contentHash`.
`chat.md` / `chat.html` are derived and carry their own file hashes.

manifest identity / provenance:
```text
schema: h2o.savedChatPackage   schemaVersion: 1
packageId: pkg_snap_1778516336177_wy9txv06_fe608c13cff6
chatId: 69f0c5f3-30c4-83eb-9240-26331d09532b   snapshotId: snap_1778516336177_wy9txv06
provenance.sourceOfTruth: desktop-sqlite-store   provenance.projectionOnly: true
```

## DB proof (`saved_chat_archive_requests`, read-only)

```text
request_id  ee16950d-bf65-481b-a4fd-1ff5d053d2ff
status      written            (was: validated)
snapshot_id snap_1778516336177_wy9txv06
updated_at  2026-06-29T09:21:06.082Z

meta_json.materialization:
  packagePath:          archive/packages/69f0c5f3-30c4-83eb-9240-26331d09532b.h2ochat
  schemaVersion:        1
  payloadVersion:       1
  contentHash:          sha256-fe608c13cff690a078bbf1caacbad7d8b439c94385b4a0e5ea0d1e9f2589a8ec
  snapshotId:           snap_1778516336177_wy9txv06
  writtenAt:            2026-06-29T09:21:06.082Z
  processingStartedAt:  2026-06-29T09:21:06.039Z
  processingFinishedAt: 2026-06-29T09:21:06.082Z
  overwrite:            false
```

- Row transitioned `validated → written`; `meta_json.materialization` matches the
  on-disk manifest and the runtime result exactly.
- **No `failed` / `db-unavailable` / stuck-`writing` row** for this request, chat,
  or snapshot.
- Status distribution moved by exactly one request:
  `validated 57→56`, `written 4→5` (`needs-desktop-snapshot 7`, `rejected 3`
  unchanged). Total request count unchanged at **71** — consistent with **no
  scanner run** (a scan would have enqueued/refreshed inbox rows).

## Diagnostics proof

The live Archive Health diagnostics (`diagnoseSavedChatArchiveV1`) reported
`ok:true, status:"ok", packageCount:17` **before** the batch. After the batch the
package root holds **18** packages, and the new package is **hash-consistent** (all
`REQUIRED_FILES` present; every recomputed sha256 matches its manifest descriptor;
`assets:[]` with no `assets/` dir) — so it registers as **packagesOk**.
**Limitation:** the live card is `plugin:fs`-based and Tauri-webview-only; the
post-batch C5.1/C5.2/C5.3 checks were performed on disk with identical semantics
(the operator may re-run the live card read-only for a UI confirmation).

## Boundary proof

- **Scanner was not run** — the batch never calls
  `scanSavedChatArchiveRequestInboxV1`; the immutable scan receipt
  `ee16950d-….receipt.json` is untouched; total request count is unchanged (71),
  so no scan enqueued/refreshed rows.
- **No Chrome writes** — Desktop-only path; package `provenance` is
  `sourceOfTruth: desktop-sqlite-store`, `projectionOnly: true`.
- **No sidecar receipt** — no `*.materialization.receipt.json` exists (F.4 sidecar
  remains deferred; F.4.1 lock intact).
- **No package overwrite** — `overwrite:false` in result + `meta_json`; the
  idempotent re-call returned `already-written` with identical
  `contentHash`/`packagePath` and wrote nothing.
- **No watcher/poller/daemon** — explicit operator click only (validator-enforced).
- **No `S0F0j` / `S0F1j` edits; no sync / WebDAV / native messaging.**
- **No capability change** — `remote.urls` source unchanged (1430 only; see the
  port note above).

## Validation results

```text
validate-saved-chat-archive-auto-materialization-trigger-v1.mjs   PASS 28 checks
validate-saved-chat-archive-materializer-trigger-v1.mjs           PASS 24 checks
validate-saved-chat-archive-package-written-status-v1.mjs         PASS 15 checks
validate-saved-chat-archive-materializer-v1.mjs                   all 14 checks passed
validate-studio-archive-health-ui.mjs                             all 19 checks passed
git diff --check / --cached --check                               clean
```

No runtime code changed in G.3 (evidence/docs only). The G.3 runtime used the
G.2 build (`23dd24d`) after a frontend `pack-studio.mjs` re-pack.

## Verdict

**G.3 BOUNDED BATCH RUNTIME SMOKE — PASSED.** The G.2 bounded "Materialize
validated" batch materialized a real `validated` request into a real,
hash-consistent `.h2ochat` package at `limit:1` (deterministic, safe target),
verified across disk / DB `meta_json.materialization` / manifest / diagnostics, and
proven idempotent via the direct materializer call (`already-written`, no
duplicate). The scanner stayed enqueue-only, no Chrome authority expanded, no
sidecar was written, and no package was overwritten.

## Recommended next step after G.3

Proceed to **G.4** — the optional sidecar integration **decision**: now that
materialization can be run in routine, bounded operator batches, decide whether to
implement the F.4 Chrome-visible `package-written` sidecar + read-back
(F.4.2/F.4.3) or keep package-written state Desktop-only in Archive Health. Then
**G.5** closes Phase G. Separately (housekeeping, not a blocker): pin the Tauri dev
server port to 1430 or extend the capability `remote.urls` to the actual dev port,
so SQL/FS reproducibly pass without relying on an out-of-source ACL.
