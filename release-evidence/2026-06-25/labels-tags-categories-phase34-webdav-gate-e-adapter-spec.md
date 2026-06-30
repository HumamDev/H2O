# Labels / Tags / Categories / Classification Metadata Sync

## Phase 34 WebDAV Gate E — Dev-Only Local Server Adapter Proof Specification

Date: 2026-06-29

## Status

DESIGN / SPECIFICATION ONLY. No WebDAV server adapter was implemented. No server code was added. No
network calls were added. No product WebDAV transport was enabled. No remote writes were added. No
fifth request type was added. No metadata request/receipt/projection schema was mutated. No product
sync semantics changed. No source modules were modified. The applied allowlist is unchanged at exactly
four types. This phase specifies the boundary, protocol surface, gates, failure cases, and entry
criteria for a later dev-only local/mock WebDAV server adapter proof — before any implementation.

## Context

- Phase 33 WebDAV next-step design gate committed: `8cfa9ef` (recommended Option B — this Gate E spec).
- Phase 32 loopback sandbox proof committed: `f908ddc`.
- Phase 31 local sandbox proof committed: `bccbdd4`.
- Phase 30 dry-run gates committed: `05814b6`
  (`src-surfaces-base/studio/sync/webdav-transport-gates.js`, a disabled-by-default guard/manifest
  evaluator).
- Phases 30–32 proved: WebDAV disabled by default; any dev behavior requires
  `webdav-dev-only-do-not-ship`; product WebDAV transport unimplemented; active product transport
  remains local sync-folder JSON; byte-unchanged `latest.json` / `chrome-latest.json`; no writes
  outside the sandbox; no external network calls; product metadata sync globally NOT READY.

## Locked Invariants

- Applied request types remain exactly: `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind`.
- WebDAV carries the SAME envelopes unchanged; no schema mutation; no new applied request types.
- Desktop remains canonical authority; Chrome remains request-only/read-only; the adapter is dumb
  transport only.
- `productSyncReady` stays `false`.

## 1. Allowed Adapter Proof Shape

- a local-only/mock WebDAV server (an in-process mock or a localhost-bound dev server); never a real
  remote.
- temp/sandbox root only (an OS temp directory created and torn down by the proof); never a real
  library path.
- no external WebDAV account.
- no real user credentials.
- no public/premium enablement.
- explicit `webdav-dev-only-do-not-ship` required for any write-capable behavior; disabled by default.

## 2. Protocol Surface to Prove

The adapter proof must exercise the WebDAV verbs and semantics that the byte-equal mirror relies on:

- `PROPFIND` — discover remote resource existence/metadata (read state).
- `PUT` — upload a staged file.
- `GET` — read a remote file back for byte-equivalence checks.
- `MOVE` — atomic publish (rename `.tmp` staging to the final name).
- ETag / precondition behavior — `If-Match` / `If-None-Match` to detect concurrent change and prevent
  lost updates.
- interrupted `PUT` / partial-upload handling — an interrupted upload leaves only a `.tmp` that is
  never published; readers ignore `.tmp`.
- atomic publish via `MOVE` — the final file appears only after a successful `MOVE`; no partial file is
  ever read.

## 3. Envelope Constraints

- carry `latest.json` byte-unchanged (content hash + file hash match the local file).
- carry `chrome-latest.json` byte-unchanged (content hash + file hash match the local file).
- no metadata request/receipt/projection schema mutation (envelopes carried as opaque bytes).
- no new applied request types.

## 4. Authority Constraints

- Desktop remains canonical authority: only Desktop validates and applies; only Desktop writes the
  canonical projection.
- Chrome remains request-only and read-only over canonical metadata: no Chrome canonical mutation.
- the WebDAV server adapter is DUMB TRANSPORT only: it stores/forwards opaque files via the verbs
  above; it never validates, applies, merges, transforms, or interprets envelope contents.

## 5. Safety Gates

- disabled by default (no adapter path runs unless the gates are explicitly enabled).
- dev-only flag required (`webdav-dev-only-do-not-ship`) for any write-capable behavior.
- path containment required: every adapter path resolves inside the sandbox root; traversal (`..`,
  absolute escapes, symlink escapes) is rejected.
- no write outside the sandbox root.
- no network outside the local/mock server (localhost-bound or in-process; no external egress).
- no credentials/secrets in evidence or logs.
- redacted/hash-only evidence (manifest + diagnostics carry hashes/counters/status only).

## 6. Failure Cases to Prove Later

The later adapter proof must drive and safely resolve each of these (each maps to the Phase 28 failure
taxonomy and falls back to local sync-folder JSON; none mutates Desktop canonical state):

- missing remote file
- malformed remote file
- checksum mismatch
- stale remote
- sequence regression
- peer mismatch
- interrupted upload
- failed atomic move
- duplicate/replay
- corrupt sandbox state
- dev flag missing

## 7. Entry Criteria for Phase 35 Implementation

A Phase 35 dev-only adapter implementation may proceed ONLY when ALL hold:

- this Gate E evidence is committed.
- the Phase 34 validator proves the design-only posture.
- the Phase 34 validator passes.
- the Phase 33–30 validators still pass.
- no product-ready claim (`productSyncReady` stays `false`).
- no allowlist expansion (the applied allowlist stays exactly the four proven types).

## 8. Block Conditions

Any of the following blocks the adapter proof (it must not proceed / must stop):

- any product WebDAV enablement
- any real remote WebDAV account dependency
- any credential/raw-data evidence
- any schema mutation
- any applied allowlist expansion
- any Chrome canonical mutation
- any Desktop authority weakening
- any write outside the sandbox
- any `productSyncReady` true claim

## Gate E Design Verdict

READY (design/spec only). The allowed adapter proof shape, the WebDAV protocol surface
(`PROPFIND` / `PUT` / `GET` / `MOVE` / ETag-preconditions / partial-upload / atomic-move via `MOVE`),
the envelope constraints (byte-unchanged `latest.json` / `chrome-latest.json`, no schema mutation, no
new applied types), the authority constraints (Desktop-canonical / Chrome-request-only / dumb
transport), the safety gates, the failure cases, the Phase 35 entry criteria, and the block conditions
are specified. No WebDAV server adapter, no server code, no network, no remote write, no schema
mutation, no allowlist change, and no behavior change were made.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. `productSyncReady` stays `false`. The Gate E spec enables
no transport and changes no readiness; only the four applied types are runtime-proven and WebDAV stays
deferred/dev-only. Active product transport remains local sync-folder JSON.

## Recommended Phase 35

Phase 35: implement the dev-only local/mock WebDAV server adapter proof behind the Phase 28/30 gates
and execute it — only if every §7 entry criterion holds — exercising the §2 protocol surface and the
§6 failure cases against a temp/sandbox root, with byte-unchanged envelopes, path containment, the
`webdav-dev-only-do-not-ship` flag, redacted evidence, no external network/account/credentials, no
allowlist change, no schema mutation, and `productSyncReady` false. No public/premium enablement.
