# Labels / Tags / Categories / Classification Metadata Sync

## Phase 38 WebDAV Localhost Smoke Harness

Date: 2026-06-30

## Status

DEV-ONLY LOCALHOST SMOKE HARNESS / VALIDATOR ONLY. A loopback-only smoke harness was added under
`tools/validation/sync/`. No product runtime source was changed. No product WebDAV transport was
enabled. No public or premium feature was enabled. No real WebDAV account was used. No credentials were
used. No external network dependency was introduced. No remote write outside a temp sandbox occurred.
The active product transport remains local sync-folder JSON. WebDAV remains disabled by default and
the smoke behavior requires `webdav-dev-only-do-not-ship`.

## Context

- Phase 37 localhost smoke spec committed cleanly: `7e72d04`.
- Phase 36 localhost smoke design gate committed: `5d473f9`.
- Phase 35 local/mock adapter proof committed: `dc10129`.
- Phase 30 dry-run gates committed: `05814b6`.
- The previous mixed Phase 37 commit was corrected; A7 files are out of scope and are not part of this
  phase.

## Locked Invariants

- Applied metadata request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`
- Product WebDAV transport remains unimplemented.
- WebDAV remains disabled by default.
- Any dev behavior requires `webdav-dev-only-do-not-ship`.
- Local sync-folder JSON remains the active product transport.
- `latest.json` and `chrome-latest.json` remain opaque byte envelopes.
- No metadata request/receipt/projection schema mutation occurred.
- Desktop remains canonical authority.
- Chrome remains request-only/read-only over canonical metadata.
- Product metadata sync remains globally NOT READY and `productSyncReady` remains `false`.

## Harness Location

Validator:

`tools/validation/sync/validate-labels-tags-categories-phase38-webdav-localhost-smoke-harness.mjs`

The validator creates an OS temp sandbox and starts a short-lived loopback-only server bound to
`127.0.0.1` on an ephemeral port. The port is not recorded in evidence. The server is created inside
the validator only and is shut down during cleanup. It is not imported by Studio runtime and is not
wired into product transport.

## Smoke Proof Summary

The validator proves:

- WebDAV behavior is blocked by default through the Phase 30 gates.
- `webdav-dev-only-do-not-ship` is required before the localhost smoke server starts.
- the server binds only to loopback.
- all file operations resolve inside a temp sandbox root.
- path traversal and sandbox escape are rejected.
- no external network or real WebDAV account is used.
- no credentials are used.
- `PROPFIND` runs over a real loopback socket.
- `PUT` runs over a real loopback socket.
- `GET` runs over a real loopback socket.
- `MOVE` runs over a real loopback socket.
- ETag / precondition behavior is enforced over the wire.
- interrupted PUT is modeled over the wire.
- partial upload does not publish a final file.
- atomic publish occurs through server-side MOVE.
- `chrome-latest.json` is carried byte-unchanged.
- `latest.json` is carried byte-unchanged.
- malformed remote file is rejected.
- checksum mismatch is rejected.
- sequence regression is rejected.
- peer mismatch is rejected.
- duplicate/replay of identical bytes is safe.
- server unavailable / timeout is handled safely.
- local fallback remains available.
- no product transport was enabled.
- no applied request type expansion occurred.
- no metadata envelope schema mutation occurred.
- product metadata sync remains globally NOT READY.

## Socket-Bound Protocol Result

| Operation | Proof Result | Boundary |
| --- | --- | --- |
| `PROPFIND` | PASS | Loopback socket only; returns existence/size/ETag status. |
| `PUT` | PASS | Writes only staging files inside the temp sandbox. |
| `GET` | PASS | Reads only final files inside the temp sandbox. |
| `MOVE` | PASS | Publishes staging object to final object inside the sandbox. |
| ETag / preconditions | PASS | Wrong `If-Match` blocks overwrite and preserves final bytes. |
| interrupted PUT | PASS | Partial staging object remains unpublished. |
| partial upload | PASS | Final object is absent after interrupted upload. |
| atomic MOVE | PASS | Final object appears only after server-side `MOVE`. |

## Envelope Proof

The smoke uses deterministic sample bytes for:

- `latest.json`
- `chrome-latest.json`

Both files are treated as opaque bytes. SHA-256 is computed before upload and after read-back. The
hashes and byte strings match. The localhost server never parses, rewrites, merges, applies, or
interprets the envelopes. Separate proof checks reject malformed, checksum-mismatched,
sequence-regressed, and peer-mismatched remote states.

## Failure and Fallback Proof

The validator models and checks:

- default disabled: blocked before server startup.
- missing dev flag: blocked before server startup.
- path escape attempt: rejected.
- ETag mismatch: rejected before overwrite.
- interrupted PUT: partial staging file only; no final publish.
- malformed remote file: rejected by proof validation.
- checksum mismatch: rejected by proof validation.
- sequence regression: rejected by proof validation.
- peer mismatch: rejected by proof validation.
- duplicate/replay: safe and byte-identical.
- server unavailable / timeout: safely reported without product fallback mutation.
- fallback: local sync-folder JSON remains the active product transport.

## Privacy and Redaction

Evidence and validator output are hash/status only. No secrets, credentials, routable endpoints, chat
title text, chat body text, label names, tag names, category names, account metadata, or account-linked
data are present. The loopback port is not recorded; the smoke reports only that loopback binding was
used.

## What Changed

- Added Phase 38 evidence.
- Added Phase 38 validator/smoke harness.

## What Did Not Change

- No product runtime source changed.
- No product WebDAV transport was enabled.
- No Studio WebDAV server code was added.
- No public/premium behavior was added.
- No real remote WebDAV account was used.
- No credentials were used.
- No external network dependency was introduced.
- No remote write outside a temp sandbox occurred.
- No UI was added.
- No request type was added.
- No metadata schema was changed.
- No Chrome canonical mutation was introduced.
- No Desktop authority behavior changed.

## Validation

Required validation:

- `git status --short`
- `git diff --check`
- `git diff --cached --check` when staged
- `node --check tools/validation/sync/validate-labels-tags-categories-phase38-webdav-localhost-smoke-harness.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase38-webdav-localhost-smoke-harness.mjs`
- Phase 37 through Phase 30 validators
- Phase 29 through Phase 11 validator chain
- F19 sync hardening
- F15 cutover

## Phase 38 Verdict

PASSED. Phase 38 proves a dev-only localhost WebDAV smoke harness behind
`webdav-dev-only-do-not-ship`, with WebDAV disabled by default, loopback-only server binding,
temp/sandbox-only storage, real socket-bound `PROPFIND`/`PUT`/`GET`/`MOVE`, ETag/precondition checks,
interrupted upload handling, partial upload non-publish behavior, atomic server-side `MOVE`, byte-
unchanged `latest.json` and `chrome-latest.json`, safe failure handling, unchanged metadata envelopes,
unchanged four-type allowlist, Desktop-canonical / Chrome-request-only authority, and product metadata
sync globally NOT READY.

## Product Metadata Sync Verdict

Product metadata sync remains NOT READY globally. The four proven metadata request types remain the
only applied types, WebDAV remains dev-only/proof-only, and active product transport remains local
sync-folder JSON.

## Recommended Phase 39

Phase 39 should be a readiness/audit gate for the localhost WebDAV smoke lane. It should decide
whether the dev-only localhost proof is sufficient to close the local transport proof series or whether
another evidence-only hardening slice is needed. It must not enable product WebDAV transport, must not
use real remote accounts or credentials, must not broaden request types or schemas, and must keep
product metadata sync globally NOT READY.
