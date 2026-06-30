# Labels / Tags / Categories / Classification Metadata Sync

## Phase 36 WebDAV Localhost Smoke Design Gate (post local/mock adapter decision)

Date: 2026-06-29

## Status

DESIGN / AUDIT ONLY. No localhost WebDAV server smoke harness was implemented. No server code was
added. No network calls were added. No product WebDAV transport was enabled. No remote writes were
added. No real WebDAV account was used. No credentials were added. No fifth request type was added. No
metadata request/receipt/projection schema was mutated. No product sync semantics changed. No source
modules were modified. The applied allowlist is unchanged at exactly four types. This phase decides
the next WebDAV step after the Phase 35 local/mock adapter proof.

## Context

- Phase 35 local/mock WebDAV adapter proof committed: `dc10129`
  (`release-evidence/2026-06-25/labels-tags-categories-phase35-webdav-local-mock-adapter-proof.md`;
  the proof is an in-process mock in the validator — it added NO product runtime source).
- Phase 34 Gate E adapter spec committed: `72a1b41`.
- Phase 33 design gate committed: `8cfa9ef`.
- Phase 35 proved: local/mock adapter only; `PROPFIND` / `PUT` / `GET` / `MOVE`; ETag/preconditions;
  interrupted PUT / partial upload; atomic `MOVE`; byte-unchanged `latest.json` and
  `chrome-latest.json`; no product runtime source changed; no external network; no real remote account;
  no credentials; no product WebDAV transport enablement; product metadata sync globally NOT READY.

## Current Source State (re-grounded)

- Metadata loop modules (`folder-sync.tauri.js`, `folder-import.mv3.js`) still mark `webdav: 'deferred'`;
  active product transport remains local sync-folder JSON.
- `webdav-transport-gates.js` is a disabled-by-default guard/manifest evaluator (`webdav-dev-only-do-not-ship`,
  `disabled-by-default-proof-only`) with no server/network code.
- Phase 35 added only a validator + evidence; the mock adapter is entirely in-process in the proof
  harness. No real socket, server, or network exists yet.
- Applied request types remain exactly: `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind`.

## 1. Decision — Is a Localhost WebDAV Server Smoke Harness Justified?

A localhost smoke harness is justified as a DESIGN-ONLY next step (spec before implementation), not as
a direct build. Rationale:

- Phase 35 proves the adapter LOGIC (verbs, ETag/preconditions, partial-upload, atomic publish,
  byte-equivalence) against an IN-PROCESS MOCK. It does not exercise real HTTP/socket transport: a real
  WebDAV server over a real connection, real header/precondition behavior over the wire, real
  connection-interruption during PUT, and real server-side MOVE atomicity.
- A localhost-only smoke harness (a localhost-bound dev server + the adapter over a real socket) would
  close that transport-layer gap deterministically and safely, without any external network, real
  remote, account, or credentials.
- BUT a localhost server + socket is a new surface (real server/network code, even if localhost-bound)
  and must be specified — boundaries, risks, block conditions — BEFORE implementation. Therefore the
  next step is a design-only localhost smoke spec (Option B), not a direct harness implementation
  (Option C) and not a full stop (Option A).

Phase 35 is sufficient as a proof rung on its own; the mock need not be re-run.

## 2. Option Comparison

| Option | What | Value | Risk | Verdict |
| --- | --- | --- | --- | --- |
| Stay at local/mock adapter proof (A) | keep Phase 35 as the terminal WebDAV proof | none beyond Phase 35; zero new surface | none | safe fallback if pausing WebDAV |
| Design a localhost server smoke harness (B) | a design-only spec for a localhost-only smoke | bounds the real-transport proof at zero runtime risk | none (design only) | RECOMMENDED next |
| Implement a dev-only localhost smoke harness later (C) | build + run the localhost smoke | proves real HTTP/socket/WebDAV transport | new socket/server surface; must be gated | only AFTER a spec (B) is accepted and entry criteria hold |

## 3. Value of a Localhost Smoke Harness Beyond Phase 35

- Real HTTP/socket transport of the byte-equal envelopes (not an in-process mock).
- Real `PROPFIND`/`PUT`/`GET`/`MOVE` over the wire, including real ETag/precondition headers.
- Real interrupted-`PUT` behavior (a dropped connection mid-upload) and real `.tmp` non-publication.
- Real server-side atomic publish via `MOVE`.
- Confidence that the adapter handles a real (if local) WebDAV server, narrowing the gap to a future
  real remote — while remaining localhost-only, dev-only, and credential-free.

## 4. Strict Boundaries for Any Future Localhost Smoke Harness

- localhost only (loopback-bound; never a routable interface, never external egress).
- temp/sandbox root only (OS temp dir created and torn down by the smoke); never a real library path.
- `webdav-dev-only-do-not-ship` required for any write-capable behavior.
- disabled by default.
- no real remote account.
- no credentials.
- no product transport enablement.
- no public/premium enablement.

## 5. Risks

- accidental product enablement
- real network leakage
- credential leakage
- path escape
- schema drift
- request allowlist drift
- authority model drift
- product-ready overclaim

## 6. Block Conditions

Any of the following blocks the localhost smoke (it must not proceed / must stop):

- any product WebDAV enablement
- any real remote WebDAV dependency
- any credential or endpoint evidence
- any schema mutation
- any applied allowlist expansion
- any Chrome canonical mutation
- any Desktop authority weakening
- any write outside the sandbox
- any `productSyncReady` true claim

## 7. Reconfirmations

- WebDAV remains disabled by default.
- `webdav-dev-only-do-not-ship` remains required for any dev behavior.
- Active product transport remains local sync-folder JSON.
- Desktop remains canonical authority.
- Chrome remains request-only and read-only over canonical metadata.
- Product metadata sync remains globally NOT READY (`productSyncReady` stays `false`).

## 8. Recommended Phase 37 Slice

Recommend **Option B — a design-only localhost WebDAV server smoke spec**.

Justification: Phase 35's mock proves the adapter logic but leaves real HTTP/socket transport unproven;
a localhost-only smoke can close that gap safely, but the localhost server + socket is a new surface
that must be specified before implementation. Option B continues the design-gate cadence at zero
runtime risk.

- Option A (defer and stabilize) is a fully safe alternative if the team wants to pause WebDAV work:
  the product transport (local sync-folder JSON) and the four-type loop are already stable and
  ready-for-review.
- Option C (dev-only localhost smoke harness implementation) is NOT recommended now: it may proceed
  only after the Option B spec is accepted and committed and every entry criterion holds.

## Phase 36 Verdict

Proceed to Option B (design-only localhost smoke spec) for Phase 37. Design/audit only; no localhost
WebDAV server smoke harness, no server code, no network, no remote write, no real account, no
credentials, no schema mutation, no allowlist change, and no behavior change were made. Active product
transport remains local sync-folder JSON; product metadata sync remains globally NOT READY.
