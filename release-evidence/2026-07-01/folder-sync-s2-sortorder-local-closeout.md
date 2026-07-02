# Folder Sync - S2 sortOrder Local Closeout

Status: S2 LOCAL SORTORDER LANE CLOSED.

This closeout covers the local Desktop folder `sortOrder` lane through canonical apply, idempotency, tied-sortOrder basis normalization, live dry-run, controlled apply, post-apply readback, sortOrder-preserving render mirror projection, and live mirror projection activation/readback.

This closeout does not declare full product sync ready. It does not authorize WebDAV, cloud, relay, `fullBundle.v3`, Chat Saving WebDAV/cloud/archive CAS, binding repair, or the S5/F11 allowed-set flip.

## References

- F32b persistent idempotency and behavioral apply proof: `247a0de`.
- F32c tied-sortOrder basis normalization: `8293156`.
- S3 live dry-run retry after F32c: `d0e330cb`.
- S4 controlled apply evidence: `c5553526`.
- Post-S4 readback/idempotency: `a47742d5`.
- S2b preflight: `aa2da1ac`.
- S2b implementation/proof: `06839407`.
- S2b live projection activation: `05b581ea`.

## Closed Scope

S2 local sortOrder is closed for these surfaces:

- Desktop canonical `sortOrder` handler path.
- Persistent idempotency.
- Tied-sortOrder basis normalization.
- Live dry-run.
- Controlled canonical apply.
- Post-apply canonical readback.
- SortOrder-preserving mirror projection.
- Live mirror projection activation/readback.

The closeout facts are:

- S3 dry-run passed after F32c.
- S4 controlled apply passed after S3.
- Canonical readback persisted to `oh:d91ad328`.
- SortOrder is no longer tied.
- F32b consumed ledger record exists.
- S2b implementation added sortOrder-preserving mirror reprojection.
- S2b live projection confirmed S2b code was loaded.
- The pre-apply mirror was stale.
- The dry-run guard passed first.
- Controlled identity apply projected the mirror.
- The post-apply mirror matches canonical `oh:d91ad328`.
- SortOrder is preserved and not stripped.
- `mirrorReprojection:"applied-sortorder-preserving-s2b"` was proven in the live path.
- `rebuildRenderMirrorFromSqlite` is not reused by S2b because it strips sortOrder.

## Not Closed

The following remain blocked or out of scope:

- S5/F11 allowed-set flip.
- Binding-mismatch repair.
- `productSyncReady` flip.
- WebDAV/cloud/relay/`fullBundle.v3`.
- Chat Saving WebDAV/cloud/archive CAS.

F11 `field-mismatch:sortOrder` may be considered for a separate S5 allowed-set flip after this closeout, but that flip is not performed here.

`binding-mismatch` remains blocked.

Binding receipt schema remains unminted.

`productSyncReady` remains `false`.

Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Boundary Notes

This closeout is local and folder-sortOrder-specific. It does not broaden folder sync readiness beyond the proven S2 sortOrder path. It does not introduce multi-writer behavior, remote transport, catalog CRUD, destructive folder behavior, or cross-surface product readiness.

The next appropriate lane action is a separate S5/F11 allowed-set flip preflight for sortOrder only, if maintainers approve it.
