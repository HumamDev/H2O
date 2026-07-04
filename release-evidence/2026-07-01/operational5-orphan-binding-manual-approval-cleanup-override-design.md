# Operational.5 - Orphan-Binding Manual-Approval Cleanup Override Design

Verdict: **OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CLEANUP OVERRIDE DESIGN READY - NO CLEANUP APPLIED**.

This is a design/preflight slice only. It does not implement cleanup, does not run cleanup apply,
does not remove any `folder_bindings` row, does not mutate folders/chats/bindings/tombstones,
does not flip `productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`, and does not
touch Chat Saving WebDAV/cloud/archive CAS.

## Context

- Strict evidence receipt implementation: `6d9267f42e88cb14084ed46483a9cd870b2ac159`.
- Strict evidence receipt write-intent fix: `db60e7b228510363bc01ca97948941b3bd686fec`.
- Live strict evidence receipt closeout: `3e2f55eeaca5e18cea679348349ca9082313f77a`.

The live closeout records:

- `targetRowToken:"row:fdd2456fc8a2"`;
- `rejectedRowTokenShouldRemainDebt:"row:a950a44b859f"`;
- `result.status:"recorded-strict-evidence-receipt"`;
- `result.ok:true`;
- `receiptPersisted:true`;
- `cleanupApplyApproved:false`;
- `tombstoneSubstitute:false`;
- `manualApprovalPrerequisiteOnly:true`;
- `exactFolderTombstonePresent:false`;
- `exactFolderBindingTombstonePresent:true`;
- `chatLive:true`;
- `folderAbsentFromCanonicalFolders:true`;
- `rowSafeShape:true`;
- `rawCanonicalBindingCount:14`;
- `exportableCanonicalBindingCount:12`;
- `productSyncReady:false`.

## Decision

Recommendation: **clean `row:fdd2456fc8a2` only through a future reviewed manual-approval override**.

`row:fdd2456fc8a2` can be eligible for a later manual-approval cleanup override because it now has
a persisted strict evidence receipt proving the live-chat dangling binding row, exact
folderBinding tombstone, absent canonical folder, absent exact folder tombstone, and safe row shape.
That receipt is still not cleanup authorization and not a tombstone substitute.

`row:a950a44b859f` must remain documented debt. It has no strict evidence receipt path, no exact
folder tombstone, no exact folderBinding tombstone, and `chatLive:false`. The future override must
explicitly reject `row:a950a44b859f` and must not touch it.

Keeping both rows as documented debt is safer than an unreviewed cleanup, but the preferred next
implementation is a narrow `fdd`-only override because `fdd` now has a persisted strict evidence
receipt and a live chat. Broad cleanup of both rows is not approved.

## Manual Approval Record

A future manual approval record must contain, at minimum:

- schema: `h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1`;
- approval gate: `operational5-orphan-binding-manual-approval-cleanup-override-apply`;
- target row token: `row:fdd2456fc8a2`;
- rejected/debt row token: `row:a950a44b859f`;
- strict evidence receipt id for `row:fdd2456fc8a2`;
- strict evidence receipt hash if exposed by the live receipt path;
- chat token: `r:2f29d39a6c4f`;
- folder token: `r:2d5469848470`;
- exact folderBinding tombstone present;
- exact folder tombstone absent;
- live chat present;
- folder absent from canonical folders;
- row safe shape true;
- operator/reviewer id or redacted reviewer token;
- review timestamp;
- statement that broad text/meta matching is not accepted;
- statement that the approval permits removing only the exact dangling `folder_bindings` row for
  `row:fdd2456fc8a2`;
- statement that the approval does not authorize folder/chat/tombstone deletion;
- statement that the approval does not authorize touching `row:a950a44b859f`;
- statement that `productSyncReady:false`, WebDAV/cloud/relay, and Chat Saving CAS remain blocked.

## Future Command Shape

The future cleanup implementation should remain dry-run-first and exact-row verified.

Recommended gate for future controlled cleanup apply:

- `operational5-orphan-binding-manual-approval-cleanup-override-apply`

The existing cleanup apply gate `operational5-orphan-binding-cleanup-apply` must not be broadened to
accept receipt-only rows. The manual override should be a separate path or a separate explicit mode
that requires both:

- persisted strict evidence receipt for `row:fdd2456fc8a2`;
- persisted manual approval record for `row:fdd2456fc8a2`;
- exact override gate `operational5-orphan-binding-manual-approval-cleanup-override-apply`.

## Required Dry-Run Proof Before Apply

Before any future controlled apply, dry-run must prove:

- target row resolves uniquely to `row:fdd2456fc8a2`;
- token contract still matches:
  - `rowToken:"row:fdd2456fc8a2"`;
  - `chatToken:"r:2f29d39a6c4f"`;
  - `folderToken:"r:2d5469848470"`;
- persisted strict evidence receipt exists and matches the target row;
- manual approval record exists and matches the target row;
- `row:a950a44b859f` is present only as documented debt or otherwise explicitly excluded;
- no exact folder tombstone is fabricated;
- exact folderBinding tombstone remains present for `fdd`;
- folder remains absent from canonical folders;
- chat remains live;
- row safe shape remains true;
- dry-run write counts are zero;
- no folder/chat/tombstone/ledger/import/export/render mirror mutation.

## Required Post-Apply Proof

If a later reviewed implementation is approved and the operator runs controlled apply, post-apply
must prove:

- raw canonical bindings drop from `14` to `13`;
- exportable canonical bindings remain `12`;
- `fullBundle.v2` binding projection remains `12`;
- only `row:fdd2456fc8a2` is removed from raw canonical active bindings;
- `row:a950a44b859f` remains documented debt and is not touched;
- canonical binding hash changes only by removal of the exact `fdd` dangling row;
- no folder/chat/tombstone deletion;
- no tombstone create/update/delete;
- no sync consumed-ledger mutation unrelated to the approval receipt;
- no import/export state mutation;
- no render-mirror write;
- duplicate apply is zero-write/idempotent;
- `productSyncReady:false` remains until a separate Operational.5 readiness decision;
- WebDAV/cloud/relay/`fullBundle.v3` remains deferred;
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## No-Go Conditions

- Do not clean `row:a950a44b859f`.
- Do not clean both rows in one broad operation.
- Do not use broad text/meta matching as proof.
- Do not treat the strict evidence receipt as cleanup authorization.
- Do not treat the strict evidence receipt as a tombstone substitute.
- Do not weaken strict tombstone verification globally.
- Do not delete folders, chats, tombstones, ledgers, receipts, import/export state, or render mirror.
- Do not flip `productSyncReady`.
- Do not start WebDAV/cloud/relay/`fullBundle.v3`.
- Do not touch Chat Saving WebDAV/cloud/archive CAS.
- Do not add fallback.

## Next Step

If approved, implement a separate `row:fdd2456fc8a2`-only manual-approval cleanup override with
dry-run first, exact-row verification, persisted approval record verification, explicit override gate,
and post-apply proof. Cleanup is not approved by this design slice.
