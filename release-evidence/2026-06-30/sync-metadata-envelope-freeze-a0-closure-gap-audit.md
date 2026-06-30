# Sync Metadata Envelope Freeze A0 - Closure Gap Audit

SYNC METADATA ENVELOPE FREEZE A0 - CLOSURE GAP AUDIT - NOT READY

## Verdict

Metadata envelope freeze cannot happen now.

The current live sync wire remains `h2o.studio.fullBundle.v2` exchanged through local
`latest.json` and `chrome-latest.json`, with additive identity stamps and per-peer local mirror state.
That bundle is a working local sync artifact, not a frozen transport-grade metadata envelope.

Archive package CAS sync L.2 remains blocked. It must not reopen until metadata sync closure,
metadata transport, identity/key runtime, and E2E encryption prerequisites are ready.

## Reconciled Current State

The current local metadata sync baseline includes:

- `h2o.studio.fullBundle.v2`
- `latest.json`
- `chrome-latest.json`
- `desktopCanonicalLibraryMetadata`
- `libraryMetadataMutationRequests`
- `libraryMetadataMutationReceipts`
- chat-folder binding receipts
- folder delete/restore receipts and tombstones
- local per-peer mirror state under the sync folder

This baseline is useful and heavily proven, but it still carries `productSyncReady: false` markers and
does not assert product-wide metadata readiness.

## Already Closed Or Review-Ready

- Folder create/rename/color local RC sync is closed.
- Folder delete/restore local Chrome/Desktop parity is closed.
- Chat-folder binding sync is closed through B9.
- Four labels/tags/categories/classification request types are live-proven:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`
- Phase 26 stabilizes the four-type loop for maintainer review.
- Package/archive bodies are excluded from metadata sync and remain in the separate archive-package lane.
- Identity/key/E2E is closed as design-only:
  - `81038e8 docs(sync): define identity key e2e model`
  - `37b646e test(sync): lock identity key e2e boundary`
  - `cf68533 docs(sync): close identity key e2e design slice`
- Archive package cloud-sync boundary remains locked by L.0/L.1.

## Still Open

- Product metadata sync is explicitly `NOT READY globally`.
- Broad deferred metadata surface remains:
  - label/tag clear/remove/unbind
  - catalog create/rename/delete
  - classification expansion
  - destructive/reversal semantics
- Multi-Desktop authority is unresolved.
- Identity/key/E2E runtime is absent.
- WebDAV metadata transport is not closed as read-only, flag-gated, identity/key-aware transport.
- No frozen metadata envelope major version is committed.
- No full unknown-major / frozen-major transport-envelope policy is committed.
- Any untracked or local-only Phase 28 Gate B specification cannot count as closure baseline.

## Envelope And Schema Findings

- Current schema is `h2o.studio.fullBundle.v2`.
- Desktop export writes `latest.json` with temp publication.
- Chrome import rejects unsupported bundle schema by exact schema mismatch.
- `desktopCanonicalLibraryMetadata`, mutation requests, and mutation receipts exist inside the current
  bundle flow.
- `productSyncReady: false` is preserved across diagnostics, receipt projections, and closeout
  evidence.
- Package/archive bodies are not part of the metadata envelope path.
- Archive package encrypted CAS sync remains separate and deferred.

## WebDAV / Relay Reconciliation

The repo contains F10.8 relay/WebDAV runtime boundaries, including manual Desktop/Tauri relay support.
Those modules are not the same as a closed, identity/key-aware, read-only WebDAV metadata transport
for frozen metadata envelopes.

Current relay/WebDAV boundaries must be interpreted as separate manual relay-envelope infrastructure:
transport is not authority, downloaded envelopes enter local validation/quarantine, and there is no
metadata-envelope freeze claim.

## Freeze Blockers

- Metadata model is not globally ready.
- Only four applied metadata request types are proven.
- Catalog mutation semantics remain deferred.
- Destructive/reversal metadata semantics remain deferred.
- Multi-Desktop authority remains unresolved.
- Identity/key/E2E runtime is absent.
- Unknown-major / frozen-major rejection policy is not committed for a transport-grade metadata
  envelope.
- WebDAV metadata transport is not closed.
- Untracked specs cannot count as closure evidence.

## Later Freeze Requirements

A future freeze must define and validate:

- Frozen transport metadata envelope major version, likely `h2o.studio.fullBundle.v3` or an equivalent
  successor.
- Explicit major/minor compatibility policy.
- Unknown-major rejection and quarantine behavior.
- Package-body exclusion invariant.
- Metadata-only transport invariant.
- Desktop authority or explicit multi-Desktop authority rule.
- No auto-apply from transport.
- Flag-gated OFF posture.
- Identity/key/E2E prerequisite references.
- Validators that enforce the frozen schema, unknown-major behavior, package-body exclusion, authority
  model, transport flags, and no auto-apply behavior.

## Recommended Next Slice

Recommended next slice: commit or re-create a dedicated Phase 28 Gate B schema/guard specification
only if it is correct and intended as baseline, then follow with a metadata-envelope freeze contract.

Do not implement WebDAV yet. Do not open archive package CAS L.2 yet.

If the Phase 28 Gate B spec is not intended as current baseline, the safer next slice is:

- Sync Metadata Envelope Freeze A1 - Frozen Envelope Contract Draft

That slice should remain docs/validator-only and must not change runtime behavior.

## Boundary Confirmation

- No runtime code changed.
- No validators changed.
- No capabilities changed.
- No WebDAV implementation added.
- No metadata envelope was frozen.
- No identity/key/E2E runtime was implemented.
- No archive package CAS transport was implemented.
- No archive restore/relink/import/export/inspector runtime changed.
- No Chrome runtime/service-worker code changed.
- No scanner/materializer/writer code changed.
