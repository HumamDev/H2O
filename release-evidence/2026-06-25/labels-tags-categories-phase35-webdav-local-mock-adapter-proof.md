# Labels / Tags / Categories / Classification Metadata Sync

## Phase 35 WebDAV Gate E - Dev-Only Local/Mock Adapter Proof

Date: 2026-06-30

## Status

PROOF / VALIDATOR ONLY. A dev-only local/mock WebDAV adapter proof harness was added under
`tools/validation/sync/`. No product WebDAV transport was enabled. No product runtime source was
changed. No server code was added to Studio. No external network call was made. No real WebDAV
account, endpoint, credential, secret, or remote write was used. The active product transport remains
local sync-folder JSON. WebDAV remains disabled by default and any adapter proof behavior requires
`webdav-dev-only-do-not-ship`.

## Context

- Phase 34 Gate E adapter spec committed: `72a1b41`.
- Phase 33 next-step design gate committed: `8cfa9ef`.
- Phase 32 loopback sandbox proof committed: `f908ddc`.
- Phase 31 local sandbox proof committed: `bccbdd4`.
- Phase 30 dry-run gates committed: `05814b6`.
- Phase 30 added `H2O.Studio.sync.webdavTransportGates`, disabled-by-default dry-run manifests,
  and the explicit dev-only write flag requirement.

## Locked Invariants

- Applied metadata request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`
- Product WebDAV transport remains unimplemented.
- WebDAV remains disabled by default.
- Local sync-folder JSON remains the active product transport.
- `latest.json` and `chrome-latest.json` remain opaque byte envelopes.
- No metadata request/receipt/projection schema mutation occurred.
- Desktop remains canonical authority.
- Chrome remains request-only/read-only over canonical metadata.
- Product metadata sync remains globally NOT READY and `productSyncReady` remains `false`.

## Proof Harness

Validator:

`tools/validation/sync/validate-labels-tags-categories-phase35-webdav-local-mock-adapter-proof.mjs`

The validator implements an in-process local/mock adapter over an OS temp sandbox directory. It does
not open a socket, does not make network calls, and does not depend on a WebDAV server package. The
adapter proof is unreachable without the explicit `webdav-dev-only-do-not-ship` flag.

The mock adapter exposes only the protocol operations required by the Phase 34 Gate E spec:

- `PROPFIND`
- `PUT`
- `GET`
- `MOVE`
- ETag / precondition behavior
- interrupted PUT / partial-upload behavior
- atomic MOVE publish behavior

## Runtime Proof Summary

The validator proves:

- default-disabled behavior blocks WebDAV adapter proof operations.
- missing `webdav-dev-only-do-not-ship` blocks write-capable proof behavior.
- with the dev flag, behavior remains local/mock/sandbox-only.
- path containment blocks traversal and sandbox escape.
- `chrome-latest.json` is staged with `PUT`, published with `MOVE`, and read with `GET` byte-unchanged.
- `latest.json` is staged with `PUT`, published with `MOVE`, and read with `GET` byte-unchanged.
- `PROPFIND` returns sandbox-local metadata only: existence, size, and ETag.
- ETag / precondition failure is safe and does not overwrite the existing final file.
- interrupted `PUT` writes only a partial staging object and never publishes a corrupted final file.
- atomic `MOVE` is the only publish path from staging object to final object.
- duplicate/replay of the same byte content remains safe and preserves the same ETag.
- malformed remote file is rejected by proof-side envelope validation.
- checksum mismatch is rejected.
- sequence regression is rejected.
- peer mismatch is rejected.
- local fallback remains available.
- no product WebDAV transport is enabled.
- no applied request type expansion occurred.
- no metadata envelope schema mutation occurred.
- product metadata sync remains globally NOT READY.

## Protocol Surface Result

| Operation | Proof Result | Safety Boundary |
| --- | --- | --- |
| `PROPFIND` | PASS | Returns only hash/size/existence metadata from the temp sandbox. |
| `PUT` | PASS | Writes only staging objects inside the sandbox root. |
| `GET` | PASS | Reads only final objects inside the sandbox root and preserves bytes. |
| `MOVE` | PASS | Publishes staging object to final object atomically inside the sandbox. |
| ETag / preconditions | PASS | Wrong precondition blocks write and preserves existing final bytes. |
| interrupted `PUT` | PASS | Partial staging object is not published and final object stays absent. |
| atomic publish via `MOVE` | PASS | Final object appears only after successful `MOVE`. |

## Envelope Proof

The validator uses deterministic sample envelopes for:

- `latest.json`
- `chrome-latest.json`

Both are treated as opaque bytes. The proof computes SHA-256 before write, after staging, after
publish, and after read-back. The hashes match and the read-back byte strings are identical to the
original inputs. The adapter never parses, rewrites, merges, or applies the envelopes. Separate proof
checks reject malformed, checksum-mismatched, sequence-regressed, and peer-mismatched remote states
before any publish claim.

## Failure and Fallback Proof

The validator models and checks:

- default disabled: blocked before adapter proof write behavior.
- missing dev flag: blocked before adapter proof write behavior.
- path traversal: rejected by sandbox containment.
- sibling directory escape: rejected by sandbox containment.
- ETag mismatch: rejected before overwrite.
- interrupted upload: partial `.tmp` only; no final publish.
- malformed file: rejected by proof validation.
- checksum mismatch: rejected by proof validation.
- sequence regression: rejected by proof validation.
- peer mismatch: rejected by proof validation.
- fallback: local sync-folder JSON remains the active product transport.

## Privacy and Redaction

Evidence and validator output are hash/status only. No secrets, endpoints, credentials, chat
titles, chat body text, label names, tag names, category names, account metadata, or
account-linked data are present. Peer and sandbox references are hashed/redacted.

## What Changed

- Added Phase 35 evidence.
- Added Phase 35 validator/proof harness.

## What Did Not Change

- No product runtime source changed.
- No WebDAV server adapter was added to product code.
- No product WebDAV transport was enabled.
- No external network or real remote WebDAV account was used.
- No remote write outside a local temp sandbox was possible.
- No UI was added.
- No request type was added.
- No metadata schema was changed.
- No Chrome canonical mutation was introduced.
- No Desktop authority behavior changed.

## Validation

Required validation:

- `git diff --check`
- `git diff --cached --check` when staged
- `node --check tools/validation/sync/validate-labels-tags-categories-phase35-webdav-local-mock-adapter-proof.mjs`
- `node tools/validation/sync/validate-labels-tags-categories-phase35-webdav-local-mock-adapter-proof.mjs`
- Phase 34 through Phase 30 validators
- Phase 29 through Phase 11 validator chain
- F19 sync hardening
- F15 cutover

## Phase 35 Verdict

PASSED. Phase 35 proves a dev-only local/mock WebDAV adapter proof behind
`webdav-dev-only-do-not-ship`, with WebDAV disabled by default, no external network, no real account,
no credentials, no product WebDAV enablement, temp/sandbox-only writes, byte-unchanged
`latest.json`/`chrome-latest.json`, atomic publish semantics, safe failure handling, unchanged
metadata envelopes, unchanged four-type allowlist, Desktop-canonical / Chrome-request-only authority,
and product metadata sync globally NOT READY.

## Product Metadata Sync Verdict

Product metadata sync remains NOT READY globally. The four proven metadata request types remain the
only applied types, and WebDAV remains dev-only/proof-only rather than product transport.

## Recommended Phase 36

Phase 36 should be a design/audit gate for whether the local/mock adapter proof is sufficient to
justify a dev-only localhost server smoke harness. It must remain behind `webdav-dev-only-do-not-ship`,
must not enable product WebDAV transport, must not use real remote accounts or credentials, must not
broaden request types or schemas, and must keep product metadata sync globally NOT READY.
