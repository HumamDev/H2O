# Labels / Tags / Categories / Classification Metadata Sync

## Phase 37 WebDAV Localhost Server Smoke Specification (dev-only)

Date: 2026-06-29

## Status

DESIGN / SPECIFICATION ONLY. No localhost WebDAV server smoke harness was implemented. No server code
was added. No network calls were added. No product WebDAV transport was enabled. No remote writes were
added. No real WebDAV account was used. No credentials were added. No fifth request type was added. No
metadata request/receipt/projection schema was mutated. No product sync semantics changed. No source
modules were modified. The applied allowlist is unchanged at exactly four types. This phase specifies
the dev-only localhost WebDAV server smoke harness — its shape, transport surface, constraints,
failure cases, and entry criteria — before any implementation.

## Context

- Phase 36 localhost smoke design gate committed: `5d473f9` (recommended this Option B spec).
- Phase 35 local/mock adapter proof committed: `dc10129` (in-process mock only; no real socket/server).
- Phase 34 Gate E adapter spec committed: `72a1b41`.
- Phase 36 concluded localhost smoke has value because it proves real HTTP/socket/WebDAV-server
  behavior while staying local/dev-only.

## Locked Invariants

- Applied request types remain exactly: `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind`.
- WebDAV carries the SAME envelopes unchanged; no schema mutation; no new applied request types.
- Desktop remains canonical authority; Chrome remains request-only/read-only; the localhost server is
  dumb transport only.
- WebDAV remains disabled by default; any dev behavior requires `webdav-dev-only-do-not-ship`.
- Active product transport remains local sync-folder JSON; `productSyncReady` stays `false`.

## 1. Allowed Localhost Smoke Harness Shape

- localhost / loopback only (bound to `127.0.0.1` / `::1`; never a routable interface).
- temp/sandbox root only (an OS temp directory created and torn down by the smoke); never a real
  library path.
- no external network (no egress beyond loopback).
- no real remote WebDAV account.
- no credentials.
- no product/public/premium enablement.
- explicit `webdav-dev-only-do-not-ship` required for any write-capable behavior.
- disabled by default.

## 2. Transport / Protocol Surface to Prove

The smoke must exercise the WebDAV verbs over a REAL socket against the localhost server:

- real socket-bound `PROPFIND` — discover remote resource existence/metadata over the wire.
- real socket-bound `PUT` — upload a staged file over the wire.
- real socket-bound `GET` — read a remote file back for byte-equivalence over the wire.
- real socket-bound `MOVE` — server-side atomic publish (rename `.tmp` to final).
- ETag / precondition headers over the wire (`If-Match` / `If-None-Match`).
- interrupted `PUT` over the wire (a dropped connection mid-upload).
- partial upload does not publish the final file (only a `.tmp` exists; readers ignore `.tmp`).
- atomic publish via server-side `MOVE` (the final file appears only after a successful `MOVE`).

## 3. Envelope Constraints

- `latest.json` byte-unchanged (content hash + file hash match the local file).
- `chrome-latest.json` byte-unchanged (content hash + file hash match the local file).
- no metadata request/receipt/projection schema mutation (envelopes carried as opaque bytes).
- no new applied request types.

## 4. Safety and Authority Constraints

- Desktop remains canonical authority: only Desktop validates and applies; only Desktop writes the
  canonical projection.
- Chrome remains request-only and read-only over canonical metadata: no Chrome canonical mutation.
- the localhost server is DUMB TRANSPORT only: it stores/forwards opaque files via the verbs above; it
  never validates, applies, merges, transforms, or interprets envelope contents.
- local sync-folder JSON remains the active product transport.

## 5. Security / Privacy Constraints

- redacted/hash-only evidence (manifest + diagnostics carry hashes/counters/status only).
- no secrets.
- no credentials.
- no real endpoint evidence (the loopback bind is referenced by label/hash, not a routable endpoint).
- no raw chat titles/content.
- no label/tag/category names.
- no account-linked metadata.

## 6. Failure Cases Phase 38 Must Prove (if implemented)

Each maps to the Phase 28 failure taxonomy and falls back to local sync-folder JSON; none mutates
Desktop canonical state:

- missing remote file
- malformed remote file
- checksum mismatch
- stale remote
- sequence regression
- peer mismatch
- interrupted PUT
- failed MOVE
- duplicate/replay
- corrupt sandbox state
- dev flag missing
- server unavailable
- request timeout
- path escape attempt

## 7. Phase 38 Entry Criteria

A Phase 38 dev-only localhost smoke implementation may proceed ONLY when ALL hold:

- this Phase 37 evidence is committed.
- the Phase 37 validator passes.
- the Phase 36–30 validators still pass.
- implementation remains dev-only.
- the localhost/loopback-only boundary is accepted.
- no product-ready claim (`productSyncReady` stays `false`).
- no schema mutation.
- no allowlist expansion (the applied allowlist stays exactly the four proven types).

## 8. Block Conditions

Any of the following blocks the localhost smoke (it must not proceed / must stop):

- any product WebDAV enablement
- any public/premium default
- any real remote WebDAV dependency
- any credential or endpoint evidence
- any external network dependency
- any schema mutation
- any applied allowlist expansion
- any Chrome canonical mutation
- any Desktop authority weakening
- any write outside the sandbox
- any `productSyncReady` true claim

## Localhost Smoke Spec Verdict

READY (design/spec only). The allowed localhost smoke harness shape, the real socket-bound transport
surface (`PROPFIND` / `PUT` / `GET` / `MOVE` / ETag-preconditions / interrupted PUT / partial upload /
atomic `MOVE`), the byte-unchanged envelope constraints, the safety/authority constraints
(Desktop-canonical / Chrome-request-only / dumb transport / local-transport-active), the
security/privacy constraints, the failure cases, the Phase 38 entry criteria, and the block conditions
are specified. No localhost server smoke harness, no server code, no network, no remote write, no real
account, no credentials, no schema mutation, no allowlist change, and no behavior change were made.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. `productSyncReady` stays `false`. The spec enables no
transport and changes no readiness; only the four applied types are runtime-proven and WebDAV stays
deferred/dev-only. Active product transport remains local sync-folder JSON.

## Recommended Phase 38

Phase 38: implement the dev-only localhost WebDAV server smoke harness behind the Phase 28/30 gates and
execute it — only if every §7 entry criterion holds — binding a loopback-only server over a temp/
sandbox root, exercising the §2 socket-bound transport surface and the §6 failure cases, with
byte-unchanged envelopes, path containment, the `webdav-dev-only-do-not-ship` flag, redacted evidence,
no external network/account/credentials, no allowlist change, no schema mutation, and `productSyncReady`
false. No public/premium enablement.
