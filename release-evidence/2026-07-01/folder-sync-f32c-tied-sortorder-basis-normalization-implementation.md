# Folder Sync - F32c Tied-sortOrder Basis Normalization Implementation

Status: IMPLEMENTED_AND_REPROVED_WITH_FIXTURES.

This slice implements the F32c handler-side basis normalization approved by the F32c-preflight gate. It does not run live Desktop, does not retry S3, does not start S4, does not pass the F32 live gate, does not implement S2b, does not change the F11 allowed or blocked set, and does not flip `productSyncReady`.

## References

- F32b persistent idempotency and behavioral apply proof: `247a0de`.
- F34b classifier introspection: `bdb66bf`.
- F32c-preflight design gate: `13755b0`.

F34b confirmed the tied-sortOrder defect:

```json
{
  "allSortOrderTied": true,
  "genuineReorderUnsatisfiableUnderTies": true,
  "identityClassifyReason": null,
  "genuineReorderClassifyReason": "stale-basis",
  "basisOrderingHash": "oh:d526bd90",
  "requestedOrderingHash": "oh:d91ad328"
}
```

## Implemented Contract

`f32CurrentPayloadOrder(payloadIds, snapshot)` now derives current payload order from canonical snapshot state:

`payload ids ordered by (sortOrder, position in snapshot.visibleOrderIds)`

The helper no longer falls back to proposed payload position when canonical `sortOrder` values are tied. If a payload id is absent from `snapshot.visibleOrderIds`, it uses a stable string/id fallback only for that impossible missing visible-index case.

The proposer basis contract remains:

`basisOrderingHash = orderingHash(current visible order restricted to the payload set)`

## Proof Coverage

F33 VM decision-path proof now includes tied-sortOrder fixtures:

- all-zero `sortOrder` genuine reorder with basis from current visible order classifies accepted/null.
- all-zero `sortOrder` wrong-basis request still classifies `stale-basis`.
- distinct-sortOrder fixtures remain covered by the existing accepted and conflict matrix.

F32b sqlite behavioral harness now includes an all-zero `sortOrder` temp DB dry-run fixture:

- genuine reorder returns a planned `status:"dry-run"` receipt.
- `canonicalWriteCount` remains `0`.
- canonical row writes remain `0`.
- consumed-operation ledger records remain `0` for dry-run.
- existing apply/replay persistent idempotency proof remains green.

## Unchanged Boundaries

- Request schema is unchanged.
- Receipt schema is unchanged.
- Conflict precedence is unchanged except the derived current order now uses canonical visible order as tied-sortOrder tie-break.
- Dry-run remains default.
- Apply gate is unchanged.
- F32b consumed-operation ledger semantics are unchanged.
- `mirrorReprojection: 'deferred-to-s2b'` remains unchanged.
- No mirror write is introduced.
- No binding receipt schema is minted.
- F11 still blocks `field-mismatch:sortOrder` and `binding-mismatch`.
- `productSyncReady` remains `false`.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Gate Status

F32c does not pass S3 by itself.

S3 retry remains a separate live Desktop dry-run slice. It must use a genuine reorder, no `apply:true`, no gate, and expect a planned `status:"dry-run"` receipt.

S4 controlled apply remains blocked until S3 passes and explicit approval is given.

S2b remains design-only. S5/F11 allowed-set changes remain blocked.
