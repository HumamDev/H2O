# Labels / Tags / Categories / Classification Metadata Sync

## Phase 33 WebDAV Next-Step Design Gate (post local-loopback decision)

Date: 2026-06-29

## Status

DESIGN / AUDIT ONLY. No WebDAV server adapter was implemented. No product WebDAV transport was enabled.
No network calls were added. No remote writes were added. No source modules were modified. No fifth
request type was added. No metadata request/receipt/projection schema was mutated. The applied
allowlist is unchanged at exactly four types. This phase decides the next WebDAV step after the Phase
32 local loopback sandbox proof.

## Context

- Phase 32 loopback sandbox proof committed: `f908ddc`
  (`release-evidence/2026-06-25/labels-tags-categories-phase32-webdav-loopback-sandbox-proof.md`).
- Phase 31 local sandbox proof committed: `bccbdd4`.
- Phase 30 dry-run gates committed: `05814b6`
  (`src-surfaces-base/studio/sync/webdav-transport-gates.js` — a disabled-by-default guard + manifest
  evaluator; `implementationStatus: 'disabled-by-default-proof-only'`).
- Phase 32 proved: WebDAV remains disabled by default; loopback behavior requires
  `webdav-dev-only-do-not-ship`; product WebDAV transport remains unimplemented; local sync-folder JSON
  remains the active product transport; no external network calls; no writes outside the sandbox;
  byte-unchanged `latest.json` / `chrome-latest.json`; product metadata sync remains globally NOT READY.

## Current Source State (re-grounded)

- The metadata loop modules (`folder-sync.tauri.js`, `folder-import.mv3.js`) still mark
  `webdav: 'deferred'`; the active product transport remains local sync-folder JSON.
- `webdav-transport-gates.js` is a disabled-by-default guard/manifest evaluator only: it contains the
  `webdav-dev-only-do-not-ship` dev flag and `disabled-by-default-proof-only` posture, and contains NO
  network/server code (no `createServer`, no `fetch(`, no `PROPFIND`, no socket). It performs no real
  transport.
- Applied request types remain exactly: `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind`.

## 1. Decision — Is a Gate E Local WebDAV Server Adapter Design Justified?

YES, a Gate E DESIGN is justified — but only as design, not implementation. Rationale:

- The Phase 32 loopback sandbox proof validates the gate matrix, the control-plane manifest, and
  byte-equivalence of the carried envelopes against a local loopback. It does NOT exercise the actual
  WebDAV PROTOCOL semantics (PROPFIND / PUT / GET / MOVE, ETag/precondition handling, partial upload
  via an interrupted PUT, atomic publish via MOVE).
- A dev-only, local-only/mock WebDAV server adapter proof would close that protocol gap deterministically
  and safely, without any real remote, network egress, or product enablement.
- BUT a server/protocol adapter is a new surface and must be specified (entry criteria, non-goals,
  allowed shape, block conditions) BEFORE any implementation. Therefore the next step is a design-only
  Gate E spec (Option B), not a direct adapter implementation (Option C) and not a full stop (Option A).

Phase 32 is sufficient as a proof rung on its own; the loopback need not be re-run. The justified next
move is to specify the adapter proof, gated, before building it.

## 2. Entry Criteria for Any Later Dev-Only WebDAV Server Adapter Proof

A later dev-only adapter proof may proceed ONLY when ALL hold:

- A committed Gate E design (the Option B output) defining the adapter shape, non-goals, and block
  conditions.
- WebDAV remains disabled by default; the adapter proof runs only under `webdav-dev-only-do-not-ship`.
- The Phase 28/29 guard matrix + control-plane manifest are reused unchanged.
- Envelopes (`latest.json`, `chrome-latest.json`) are carried byte-unchanged; no schema mutation.
- The applied allowlist is still exactly the four proven types.
- Desktop-canonical / Chrome-request-only / dumb-transport authority is preserved.
- The adapter is local-only/mock against a temp/sandbox root with strict path containment; no real
  remote, no real credentials, no network egress.
- Evidence is redacted; no secret/endpoint/raw-data appears.
- `productSyncReady` stays `false`.

## 3. Strict Non-Goals

- no product enablement
- no public/premium enablement
- no real user credentials
- no real external WebDAV account
- no production remote writes

## 4. Allowed Adapter Proof Shape (if approved at Gate E)

- a local-only server or mock adapter (in-process mock or a localhost dev server), never a real remote.
- temp/sandbox root only (an OS temp dir created and torn down by the proof), never a real library path.
- explicit `webdav-dev-only-do-not-ship` required for any write-capable behavior.
- byte-unchanged envelopes (the adapter transports the exact `latest.json` / `chrome-latest.json`
  bytes; content hash + file hash match local).
- path containment (every adapter path resolves inside the sandbox root; traversal is rejected).
- redacted evidence only (manifest + diagnostics carry hashes/counters/status; no secret/raw-data).

## 5. Block Conditions (force deferral)

Any of the following forces deferral (the adapter proof must not proceed / must stop):

- any metadata request/receipt/projection schema mutation
- any allowlist expansion (a fifth applied type)
- any Chrome canonical mutation
- any Desktop authority weakening (Desktop no longer sole canonical authority, or transport doing
  validation/apply/merge)
- any credential/raw-data leakage in evidence or diagnostics
- any write outside the sandbox root
- any product-ready claim while transport is gated/unproven (`productSyncReady` must stay `false`)

## 6. Active Product Transport Reconfirmation

The active product transport remains local sync-folder JSON only (`chrome-latest.json` Chrome →
Desktop, `latest.json` Desktop → Chrome). WebDAV is not a product transport; the gates module is a
disabled-by-default dev sandbox and the loop modules still mark `webdav: 'deferred'`.

## 7. Product Metadata Sync Reconfirmation

Product metadata sync remains globally NOT READY. `productSyncReady` stays `false`. Only the four
applied types are runtime-proven; WebDAV stays deferred/dev-only.

## 8. Recommended Phase 34 Slice

Recommend **Option B — a design-only Gate E spec** for the dev-only local WebDAV server adapter proof.

Justification: the loopback proof (Phase 32) leaves the WebDAV protocol layer unproven; a local-only/
mock server adapter can close that gap safely, but it is a new surface that must be specified before
implementation. Option B continues the established design-gate cadence at zero runtime risk.

- Option A (defer and stabilize) is a fully safe alternative if the team wants to pause WebDAV work:
  the product transport (local sync-folder JSON) and the four-type loop are already stable and
  ready-for-review, so nothing is lost by deferring.
- Option C (implement a dev-only local WebDAV server adapter proof) is NOT recommended now: it must not
  proceed before the Gate E design (Option B) is approved and committed, and before every entry
  criterion in §2 holds.

## Phase 33 Verdict

Proceed to Option B (design-only Gate E spec) for Phase 34. Design/audit only; no WebDAV server
adapter, no product WebDAV transport, no network, no remote write, no schema mutation, no allowlist
change, and no behavior change were made. Active product transport remains local sync-folder JSON;
product metadata sync remains globally NOT READY.
