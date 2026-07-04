# Operational.5 - Orphan-Binding Manual-Approval Cleanup Override Implementation

Verdict: **OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CLEANUP OVERRIDE IMPLEMENTED - LIVE APPLY NOT RUN**.

This slice implements the `row:fdd2456fc8a2`-only manual-approval cleanup override command. It does
not run live cleanup apply, does not mutate product state in this slice, does not flip
`productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`, and does not touch Chat Saving
WebDAV/cloud/archive CAS.

## Context

- Manual-approval cleanup override design: `0cf683b6c3b50e9265062cc9bc19875dd01c1f76`.
- Strict evidence receipt implementation: `6d9267f42e88cb14084ed46483a9cd870b2ac159`.
- Strict evidence receipt write-intent fix: `db60e7b228510363bc01ca97948941b3bd686fec`.
- Strict evidence receipt live closeout: `3e2f55eeaca5e18cea679348349ca9082313f77a`.

## Source Change

Product source changed:

- `src-surfaces-base/studio/store/folders.tauri.js`

New API:

- `H2O.Studio.store.folders.operational5OrphanBindingManualApprovalCleanupOverride(opts)`

New gate:

- `operational5-orphan-binding-manual-approval-cleanup-override-apply`

Schemas:

- manual approval schema: `h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1`
- result schema: `h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override-result.v1`
- receipt schema: `h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override-receipt.v1`

## Behavior

The command is dry-run by default. Controlled apply is possible only with:

- `apply:true`;
- `gate:"operational5-orphan-binding-manual-approval-cleanup-override-apply"`;
- exact target tokens:
  - `rowToken:"row:fdd2456fc8a2"`;
  - `chatToken:"r:2f29d39a6c4f"`;
  - `folderToken:"r:2d5469848470"`;
- a manual approval object with schema
  `h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1`;
- persisted strict evidence receipt for `row:fdd2456fc8a2`;
- `row:a950a44b859f` excluded as documented debt.

Pre-apply verification requires:

- exact row still exists and resolves uniquely;
- exact chat/folder tokens match;
- row safe shape is true;
- folder is absent from canonical folders;
- chat is live;
- strict evidence receipt exists and matches `row:fdd2456fc8a2`;
- strict evidence receipt still has `cleanupApplyApproved:false`;
- strict evidence receipt still has `manualApprovalPrerequisiteOnly:true`;
- strict evidence receipt remains not a tombstone substitute.

Controlled apply may remove only the exact `row:fdd2456fc8a2` row from canonical `folder_bindings`.
It must not remove `row:a950a44b859f`.

Expected later live proof shape:

- dry-run zero-write;
- apply without the exact gate blocks;
- gated apply removes exactly one row;
- duplicate apply is zero-write/idempotent;
- raw canonical bindings `14 -> 13`;
- exportable canonical bindings remain `12`;
- `fullBundle.v2` binding projection remains `12`;
- `row:a950a44b859f` remains documented debt;
- `productSyncReady:false`.

## Retained Boundaries

- No live cleanup apply was run by Codex.
- No folder delete.
- No chat delete.
- No tombstone create/update/delete.
- No import/export state mutation.
- No render-mirror write.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback.
- Existing strict tombstone-backed cleanup remains unchanged and still requires both exact tombstones.
- This override does not weaken durable/hash gates, conflict runtime, `requireContext`, restart
  convergence, reviewed request path, or render-mirror no-write boundary.

## Next Step

If approved, run the new API in Desktop Studio dry-run only. Do not run controlled apply until the
dry-run output proves exact `row:fdd2456fc8a2` targeting, strict evidence receipt match, manual
approval match, and `row:a950a44b859f` exclusion.
