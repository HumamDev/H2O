# Folder Sync - S5/F11 sortOrder Allowed-Set Flip Preflight

Status: S5/F11 SORTORDER ALLOWED-SET FLIP PREFLIGHT GO-WITH-CONDITIONS.

This is a design/preflight-only slice. No product source was edited, and the actual F11 allowed-set flip is not performed here.

## References

- S2 local sortOrder closeout: `17d5119b`.
- S2b live projection activation: `05b581ea`.
- S2b sortOrder-preserving mirror reprojection implementation: `06839407`.
- S2b preflight: `aa2da1ac`.
- Post-S4 readback/idempotency: `a47742d5`.
- S4 controlled apply evidence: `c5553526`.
- S3 dry-run evidence: `d0e330cb`.
- F32c tied-sortOrder basis normalization: `8293156`.

## Preflight Decision

`field-mismatch:sortOrder` is now eligible for a later S5/F11 allowed-set flip because the S2 local sortOrder lane is closed.

The later S5 implementation may remove or reclassify only `field-mismatch:sortOrder` from the F11 blocked set.

`binding-mismatch` must remain blocked.

Binding receipt schema remains unminted.

The F11/S5 flip must be narrow and must not imply `productSyncReady`.

`productSyncReady` remains `false` until all readiness gates pass, including binding lane status.

WebDAV/cloud/relay remains blocked.

Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Conditions For Later S5 Implementation

The S5 implementation must have its own validator and exact source-diff proof.

The S5 implementation must not touch:

- S2b projection
- F32 handler
- WebDAV
- Chat Saving
- bindings
- tombstones
- deletes
- `productSyncReady`

The next step after this preflight commit is S5/F11 implementation for a sortOrder-only allowed-set flip.

## Boundaries

This preflight does not perform the allowed-set flip.

This preflight does not unblock `binding-mismatch`.

This preflight does not mint binding receipts.

This preflight does not start WebDAV/cloud/relay or `fullBundle.v3`.

This preflight does not unblock Chat Saving WebDAV/cloud/archive CAS.
