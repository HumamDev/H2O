# Folder Sync - S5/F11 sortOrder Allowed-Set Flip

Verdict: S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED.

This implementation follows the S5/F11 preflight committed in `938b47e0` after the S2 local
sortOrder lane closeout committed in `17d5119b` and the S2b live projection proof committed in
`05b581ea`.

## Scope

This flip is narrow and applies only to `field-mismatch:sortOrder`.

`field-mismatch:sortOrder` is no longer forcibly blocked by the F11 render-only mirror rebuild
helper. It is now an approved render-only drift class that may project canonical Desktop SQLite
`sortOrder` / `sort_order` values into the derived `FOLDER_STATE_DATA_KEY` mirror.

The write target remains the render mirror only. Desktop SQLite remains canonical.

## Source Change

Changed source:

- `src-surfaces-base/studio/store/folders.tauri.js`

The F11 allowed class map now includes:

- `field-mismatch:sortOrder`

The forced blocked class list now keeps only:

- `binding-mismatch`

The helper records sortOrder mirror projection diagnostics through:

- `rebuiltSortOrderMismatchCount`
- `sortOrderMirrorProjectionOnly: true`
- `noCanonicalSortOrderWrite: true`

## Boundaries

`binding-mismatch` remains blocked.

Binding receipt schema remains unminted.

No binding repair was implemented.

No binding schema, handler, receipt, or request loop was changed.

`productSyncReady` remains `false`.

WebDAV/cloud/relay remains blocked.

No `fullBundle.v3` was started.

Chat Saving WebDAV/cloud/archive CAS remains blocked.

This does not declare full product sync ready.

This does not start remote sync.

## Preserved S2b Boundary

The S2b helper remains present:

- `s2bProjectSortOrderPreservingRenderMirror`

The live S2b marker remains present:

- `applied-sortorder-preserving-s2b`

S2b sortOrder-preserving projection remains separate from the F11 allowed-set flip.

## Next Gate

Next gate after this commit is productSyncReady readiness re-check / binding blocker decision.

WebDAV is still not the next step.
