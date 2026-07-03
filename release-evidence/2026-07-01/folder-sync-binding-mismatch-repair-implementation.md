# Folder Sync - Binding-Mismatch Repair Implementation

Date: 2026-07-01

## Verdict

BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN.

This slice implements the canonical Desktop binding repair handler described by the F21-F28 binding lane
contracts. It does not flip `productSyncReady`, does not start WebDAV/cloud/relay, and does not move
`binding-mismatch` into the F11 allowed set.

## References

- S5/F11 sortOrder-only allowed-set flip: `6bf420be`.
- productSyncReady readiness re-check after S5: `93dd818f`.
- binding-mismatch repair preflight after sortOrder: `6157a419`.
- F21-F28 binding contracts inspected:
  - F21 binding ownership/readiness audit.
  - F22 binding repair request/receipt spec.
  - F23 binding request/receipt conflict matrix.
  - F24 accepted apply proof.
  - F25 negative apply proof.
  - F26 implementation-readiness gate.
  - F27 readiness ledger.
  - F28 implementation sequencing plan.

## Product Source Changed

- `src-surfaces-base/studio/sync/folder-sync.tauri.js`
- `src-surfaces-base/studio/store/folders.tauri.js`

## Schemas And Gate

The implementation reuses the request schema:

- `h2o.studio.chat-folder-binding-request.v1`

The implementation mints the canonical Desktop repair receipt schema in `folder-sync.tauri.js`:

- `h2o.studio.chat-folder-binding-receipt.v1`

The implementation exposes a Desktop-only handler under:

- `H2O.Studio.sync.bindingRepair`

The gated apply path uses:

- `folder-sync-chat-folder-binding-repair-apply`

## Implemented Contract

The handler validates `bind`, `unbind`, and `move` requests, computes the current canonical binding hash
from Desktop SQLite `folder_bindings`, and emits a receipt with:

- `canonicalAuthority: "desktop-sqlite"`
- `noChatDelete: true`
- `noFolderDelete: true`
- `noFolderPurge: true`
- `noTombstoneMutation: true`
- `productSyncReady: false`
- `noMirrorWrite: true`
- `noTransportWrite: true`
- `noWebdavWrite: true`

Dry-run is the default. Dry-run produces zero canonical writes, zero mirror writes, and no consumed ledger
record.

Gated apply writes only canonical `folder_bindings` through the existing Desktop folder store. Accepted
apply records a consumed-operation ledger row so duplicate/replay requests are skipped without another
canonical write.

Rejected/conflict paths write nothing.

## Proven Behavior

The implementation validator loads the real `folder-sync.tauri.js` handler and the real
`consumed-operation-ledger.tauri.js` into a Node VM with a disposable in-memory Desktop folder binding
store.

The proof covers:

- dry-run accepted bind produces `status: "dry-run"` with `canonicalWriteCount: 0`.
- gated bind produces `status: "applied"` and updates only canonical `folder_bindings`.
- duplicate replay of the same idempotency key produces `status: "skipped"` / `reason: "duplicate"` with
  zero writes.
- gated move applies only canonical `folder_bindings`.
- gated unbind applies only canonical `folder_bindings` and uses the new `skipBindingTombstone` option so
  no tombstone mutation occurs.
- stale basis rejects with zero writes.
- orphan folder rejects with zero writes.
- orphan chat rejects with zero writes.
- tombstoned folder rejects with zero writes.
- privacy/redaction violation rejects with zero writes.

## Preserved Boundaries

- No folder delete.
- No folder purge.
- No chat delete.
- No tombstone mutation.
- No mirror write-through.
- No WebDAV/cloud/relay/fullBundle.v3.
- No Chat Saving WebDAV/cloud/archive CAS.
- No Chrome/native/mobile canonical mutation.
- `binding-mismatch` remains blocked in F11 until a later allowed-set flip/live-proof slice.
- `field-mismatch:sortOrder` remains allowed after S5.
- `productSyncReady` remains `false`.

## Next Gate

The next gate is a binding live Desktop dry-run/proof or binding allowed-set preflight, depending on the
review decision. It is not WebDAV/cloud/relay and it is not a `productSyncReady` flip.
