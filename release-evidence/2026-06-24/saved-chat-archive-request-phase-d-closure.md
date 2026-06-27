# Saved Chat Archive Request — Phase D Milestone Closure

Date: 2026-06-24

Status: PHASE D CLOSED

Lane: Chat Saving Architecture (Phase D — Chrome request intent to Desktop
saved-chat package). This is a docs/evidence-only closure note. It adds no
runtime code, no validators, and no Chrome/Desktop/capability changes.

## Objective Recap

Phase D connected Chrome save/archive **intent** to the Desktop-owned saved-chat
package pipeline without ever making Chrome authoritative: Chrome builds and
delivers a metadata-only request; Desktop validates, queues, resolves against
its own store, materializes the package, and owns all durable state. Phase D is
now proven end-to-end on a real Chrome + Desktop setup.

## Phase D Commit Map

| Subphase | Commit |
|---|---|
| D.1 request contract | `c0dec18 docs(studio): define saved chat archive request contract` |
| D.2A Desktop intake | `adceba8 feat(studio): add saved chat archive request intake` |
| D.2A intake smoke | `3f70a1c docs(studio): record saved chat archive request intake smoke` |
| D.2B durable queue | `b52c878 feat(studio): add saved chat archive request queue` |
| D.2B queue smoke | `749b3d0 docs(studio): record saved chat archive request queue smoke` |
| D.2B queue closure | `2eccc6b docs(studio): close saved chat archive request queue milestone` |
| D.2C materializer | `d578702 feat(studio): materialize saved chat archive requests` |
| D.2C materializer smoke | `d82d4ac docs(studio): record saved chat archive request materializer smoke` |
| D.2C contract docs | `2953376 docs(studio): document saved chat archive materializer contract` |
| D.3A Chrome builder | `2872f3b feat(studio): add chrome saved chat archive request builder` |
| D.3A evidence | `87c1df6 docs(studio): record archive request builder evidence` |
| D.3B.0 inbox contract | `fccc28b docs(studio): define archive request inbox contract` |
| D.3B.1 inbox intake | `c84a53f feat(studio): add archive request inbox intake` |
| D.3B.2 inbox smoke | `fbf59a0 docs(studio): record archive request inbox smoke` |
| D.3B closure | `271445b docs(studio): close archive request inbox milestone` |
| D.3C.0 delivery contract | `84dcbfc docs(studio): define archive request delivery contract` |
| D.3C.1 Chrome delivery | `d99a5a9 feat(studio): add chrome archive request delivery` |
| D.3C.1 evidence | `f786b8f docs(studio): record archive request delivery evidence` |
| D.3C.2 manual Settings UI | `92f66d7 feat(studio): add archive request delivery settings control` |
| D.3C.2 evidence | `c4a994f docs(studio): record archive request delivery ui evidence` |
| D.3C.3 receipt read-back | `91158e7 feat(studio): add archive request receipt readback` |
| D.3C.3 evidence | `56a6196 docs(studio): record archive request receipt readback evidence` |
| D.3C.4 runtime smoke | `7580b2b docs(studio): record archive request delivery runtime smoke` |
| D.3C closure | `1aedeac docs(studio): close archive request delivery milestone` |
| D.4 proof script | `f69d049 docs(studio): script saved chat archive package proof` |
| D.4 runtime evidence | `d5fc451 docs(studio): record saved chat archive package proof` |

## What Phase D Now Proves

- **D.1** locks the `h2o.savedChatArchiveRequest.v1` contract: Chrome owns request
  intent only; Desktop owns all durable archive authority; a request is not a
  package, not a store mutation, and not a second source of truth.
- **D.2A/B** validate, resolve, and durably queue Chrome requests against Desktop
  store state, with idempotent `dedupeKey` dedupe and read-only resolution.
- **D.2C** materializes a validated request into a package through the existing
  Desktop writer (`writeSavedChatPackageV1`), re-resolving first and writing only
  from Desktop store data; idempotent and fail-closed.
- **D.3A** builds a Chrome-side metadata-only request envelope (no transport).
- **D.3B** scans a dedicated Desktop-owned inbox and enqueues through D.2B only,
  writing receipts; no materialization, no Chrome authority.
- **D.3C** delivers from Chrome to the inbox via the File System Access API under
  an explicit user gesture (dedicated IndexedDB handle separate from Sync;
  `inbox/` only, never `receipts/`), with a manual Settings card and read-only,
  informational receipt read-back.
- **D.4** proves the full path end-to-end: a Chrome-delivered request that points
  at an existing Desktop snapshot resolves to `validated`, materializes to
  `written`, validates with zero blockers, passes archive diagnostics, and
  re-materializes idempotently as `already-written`.

Proven loop:

```text
Chrome intent -> metadata-only request -> Desktop inbox -> D.2B queue (validated) ->
D.2C materializer (written) -> package validation OK -> archive diagnostics OK ->
idempotent already-written
```

## Runtime Proof Anchors

- **D.3C.4** (transport + read-back): Chrome read the Desktop receipt and mapped
  it to `needs-desktop-snapshot` (no Desktop snapshot existed yet for that
  conversation). See
  `release-evidence/2026-06-24/saved-chat-archive-request-delivery-d3c4-runtime-smoke.md`.
- **D.4** (full package): with an existing Desktop snapshot, the request resolved
  `validated`, materialized `written`, validated clean, and diagnostics reported
  16/16 packages OK. requestId `a068fbe7-aee5-4edc-a761-4ccc82d4d05b`,
  contentHash `sha256-0fa2798b5b9adcf4ac1f589c72a2cdd5d7f8f9e6400d8fe17c83815a13808519`.
  See
  `release-evidence/2026-06-24/saved-chat-archive-request-package-proof-d4-runtime-smoke.md`.

D.4 closes the gap that D.3C intentionally left open.

## Locked Boundaries

- Chrome remains intent-only; Desktop remains authoritative.
- No Chrome package writer, CAS writer, or SQLite write.
- No Chrome `contentHash` computation.
- No transcript / messages / html / assets / package content in the Chrome request.
- No package is ever built from Chrome content — only from the resolved Desktop snapshot.
- No auto-materialization (materialization is Desktop-triggered only).
- No polling, no watcher, no background write/read.
- No native messaging, no localhost relay, no sync/WebDAV/cloud transport.
- No Archive Health UI mutation, no import/recovery, no user-folder export/save-dialog.
- No main save-to-folder integration yet.
- The archive request inbox and the archive root stay separate from the Sync lane.

## Deferred Work

- Main Chrome save-to-folder / archive action integration (wire real save actions
  to `deliverSavedChatArchiveRequestV1` with live resolution ids).
- Native messaging or a production transport alternative, if later needed.
- Retry / overwrite / delete / repair / stale-`writing` recovery policy.
- Import / export / recovery phase.
- Saved-package sync / WebDAV / cloud phase.
- Surfacing validated/materialized status in the Chrome card (beyond manual read-back).
- Cleanup or isolation of the old D.3B.2 negative inbox fixtures so a full
  `scanSavedChatArchiveRequestInboxV1` reads `completed` instead of
  `completed-with-blockers` (single-file intake already avoids this for proofs).

## Validation

```text
git diff --check
git diff --cached --check
```

Results:

- `git diff --check`: clean.
- `git diff --cached --check`: clean.

No docs/markdown lint/check script exists in `package.json` (confirmed); none was
run.

## Outcome

Phase D is CLOSED. The Chrome-intent-to-Desktop-package architecture is
contract-locked (D.1), implemented (D.2 intake/queue/materializer, D.3 builder/
inbox/delivery/read-back), and proven end-to-end on a real Chrome + Desktop setup
(D.3C.4 transport/read-back, D.4 full package), with all metadata-only /
intent-only / Desktop-authoritative boundaries intact. The next milestone — main
Chrome save-to-folder integration — should begin docs-first per the lane's
discipline.
