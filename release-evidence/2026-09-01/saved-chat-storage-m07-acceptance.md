# M07 — Saved-Chat Storage ↔ Transport Object Handoff — Acceptance Record

Date: 2026-09-01

Lane: 🗃️ L-SAVED-CHAT-STORAGE

Status: COMPLETE / ACCEPTED

Accepted implementation candidate:
`1c9170d3f5d5478a45021d194823f267a0b456d3`

G2 acceptance date: 2026-09-01

## Mission outcome

M07 established the trusted read-only boundary by which Saved-Chat Storage
exposes verified immutable local object sets to Transport without transferring
filesystem, CAS-path, destructive-storage, or remote-transport authority.

## Phase and gate status

- P0 — COMPLETE
- P1 — COMPLETE
- P2 — COMPLETE
- P3 — COMPLETE
- G0 — PASS
- G1 — PASS
- G2 — PASS

## Key accepted architecture

- `contentHash` remains the logical saved-chat identity.
- `representationHash` identifies the exact physical handoff representation.
- Callers have semantic-selector authority only, with no local package or CAS
  path authority.
- The retained-handle session protocol is BEGIN / READ / END.
- Every manifest-declared asset dependency is admitted completely or BEGIN
  fails closed.
- Reads are explicitly bounded, and sessions create no durable pin or lease.
- Transport normalization is exactly `sha256-<hex>` → `sha256:<hex>`.
- B4 uses the normalized `representationHash` as `candidatePayloadHash`.
- B6 uses that same normalized value for both `candidatePayloadHash` and
  `candidateBundleHash`.
- Live v3 remains unadmitted until trusted archive verification admits it.

## Independent G2 assurance summary

- `archive_transport_handoff`: 15 passed / 0 failed
- `archive_package_scan`: 12 passed / 0 failed
- `archive_generation_publish`: 80 passed / 0 failed
- `cargo check --offline --lib`: PASS
- B4 validator: PASS
- B6 validator: PASS
- AC-M07-01 through AC-M07-14: PASS
- Definition of Done: PASS

## Authority boundary

M07 grants no authority to create, replace, delete, or rename archive packages;
write CAS; mutate SQLite; mutate reclamation or retention; write
WebDAV/cloud/relay; enqueue an outbox; write a publication ledger; mint an
export ID; burn a sequence; or alter Transport approval or readiness.

## Preservation

- M05 generation publication and verification are preserved.
- M06 reclamation, retention, and destructive ordering are preserved.
- Physical CAS garbage collection remains outside M07.
- No Sync-owned implementation was changed.

## M08 handoff

M08 may consume the now-accepted storage object/package foundations for
portable ZIP/export work, but M07 does not implement M08.

## Publication state

At the time of this closure commit, the M07 commits on
`work/saved-chat-storage` remain LOCAL / UNPUBLISHED. No M07 push, PR, merge, or
main integration has occurred. This statement applies to M07 and does not
describe older M06 history as unpublished.
