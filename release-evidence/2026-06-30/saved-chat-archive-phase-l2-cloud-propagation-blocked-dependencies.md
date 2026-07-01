# Saved Chat Archive Phase L2 Cloud Propagation Blocked Dependencies

PHASE L2 ARCHIVE PACKAGE CLOUD PROPAGATION - BLOCKED / DEFERRED

## Decision

Archive package cloud propagation is blocked and deferred. Chat Saving must consume the shared Sync/WebDAV/cloud substrate when that substrate is ready. It must not build a separate archive-only WebDAV or cloud stack.

This is a design/audit coordination note only. No transport runtime is implemented in L2.

## Current Archive State

The local Chat Saving Architecture lifecycle is complete through the archive lane:

- `.h2ochat` package creation and materialization
- package inspection
- import-as-new
- restore-original-ids
- relink
- export/share by bounded Desktop folder-copy
- tombstone/un-delete boundary locked out of the archive lane

Archive package cloud sync already has a contract and static boundary lock:

- L.0 archive package cloud-sync contract
- L.1 archive package cloud-sync boundary validator

Those decisions remain in force: archive package cloud sync is the deferred encrypted CAS-over-transport lane, not a local archive implementation gap.

## Dependency Blocker

Archive package cloud propagation must wait for the shared Sync/WebDAV/cloud foundation because Folder / Metadata Sync is still not locally release-grade.

Current folder-sync source-of-truth and render mirror drift remains active in the sync lane:

- `binding-mismatch`
- `field-mismatch:color`
- `field-mismatch:sortOrder`
- `missing-mirror-folder`

The archive lane must not route around those blockers by introducing an archive-only transport. Doing so would create a second cloud stack with a different authority, identity, encryption, and apply model.

## Required Prerequisites

Archive package cloud implementation may reopen only after these shared prerequisites are proven:

- folder source-of-truth reconciliation closed
- live Chrome/Desktop folder count parity proven
- local `productSyncReady` gate reviewed
- identity/key/E2E runtime implemented
- shared WebDAV metadata transport proven
- `cloudSyncReady` path clarified

The future archive package CAS lane must reuse those shared decisions and primitives.

## Explicit Non-Goals

- No separate archive WebDAV/cloud stack.
- No `.h2ochat.enc` transport yet.
- No remote archive index yet.
- No auto-import from cloud.
- No auto-restore from cloud.
- No auto-relink from cloud.
- No Chrome package-body authority.
- No package bytes in metadata sync envelopes.
- No WebDAV/cloud/package CAS implementation in this slice.

## Reopen Rule

Archive package CAS reopens only after metadata sync, E2E runtime, and the shared WebDAV transport are proven. Until then, safe work in this area is design/audit only.

## Boundaries Preserved

- Chat Saving local lifecycle remains closed and unchanged.
- Archive package cloud sync remains boundary-locked and deferred.
- Chrome remains request-only and has no package-body authority.
- Desktop remains authoritative for package apply actions.
- No runtime code changed.
- No validators changed.
- No capabilities changed.
- No `fullBundle.v3` mint.
- No `productSyncReady` flip.
- No WebDAV/cloud/archive CAS implementation.
