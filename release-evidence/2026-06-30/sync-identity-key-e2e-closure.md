# Sync Identity + Key + E2E Encryption Design Slice Closure

IDENTITY + KEY + E2E ENCRYPTION DESIGN SLICE - CLOSED

## Closure summary

- The identity/key/E2E slice is closed as contract-only design and is explicitly not implemented.
- Current identity semantics are now documented as canonical for this lane:
  - `installId` is the stable sensitive per-install identity anchor.
  - `syncPeerId` is the current sync peer identity.
  - `peerId` is documented as inconsistent shorthand/hash usage.
  - `sync_peer_id` is documented as the storage/envelope naming field.
- Future identity/key model requirements are documented:
  - `producerDeviceId`
  - `recipientDeviceKeyId`
  - local/pseudonymous user namespace as initial identity option
  - explicit pairing and trust set
  - revocation and rotation
  - re-wrap to surviving trusted devices
  - per-device keys in OS secure storage
  - payload CEKs wrapped to trusted devices
  - verify-before-use
  - payloadHash and authenticity proof
  - quarantine on mismatch
  - transport-agnostic E2E substrate for metadata envelopes and future `.h2ochat.enc` CAS blobs

## Boundary lock

- Static boundary validator lock is in place:
  - no keychain-backed E2E runtime
  - no synced key material
  - no metadata envelope freeze introduced in this slice
  - no archive package CAS/WebDAV/cloud transport
  - no auto-apply from remote package arrival
- This slice does not implement:
  - crypto/keychain logic
  - pairing UI/runtime
  - WebDAV
  - archive package sync
  - metadata envelope freeze

## Closure dependencies

- This design slice is a prerequisite for:
  - WebDAV metadata transport
  - future archive package CAS sync L.2
- It does not freeze the metadata envelope and does not change archive-package authority.

## Deferred work

- WebDAV/package sync remains out-of-scope.
- Multi-Desktop authority and deletion/tombstone interactions remain in sync-lane sequencing.
- Any production encryption runtime is deferred until sync prerequisites are complete.

## Next roadmap

- Return to metadata sync closure / metadata envelope freeze.
- Then define multi-Desktop authority decision.
- Then implement read-only flag-gated WebDAV metadata transport.
- Reopen archive package CAS L.2 only after those prerequisites are complete.
