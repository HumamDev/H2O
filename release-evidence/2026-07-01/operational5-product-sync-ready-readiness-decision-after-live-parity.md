# Operational.5 - productSyncReady Readiness Decision After Live Parity

Verdict: **OPERATIONAL.5 PRODUCTSYNCREADY READINESS DECISION AFTER LIVE PARITY - KEEP `productSyncReady:false` / NOT FLIPPED**.

This slice records the readiness decision after the live Operational.5 Desktop read-only diagnostic
passed exportable parity with known debt. It is evidence/validator-only: no product source was edited,
no folders/chats/bindings/tombstones were mutated or deleted, `productSyncReady` was not flipped,
WebDAV/cloud/relay/`fullBundle.v3` was not started, and Chat Saving WebDAV/cloud/archive CAS remains
blocked/deferred.

## Chain Reviewed

- Operational.5 source-of-truth / canonical count parity preflight:
  `4f76cfbbc557f9898d6b8d2b9adf2b4e33e2564f`.
- Operational.5 read-only canonical count/hash parity harness:
  `52264289de23207b6db8a376f5b46dc1a127a766`.
- Operational.5 live read-only diagnostic prep:
  `0291e55d75542a482a7ff3538e4d1733c4b0ec87`.
- `fullBundle.v2` read-only projection diagnostic exposure:
  `90b633052ea86de3b192490f59482613a92eaa27`.
- `fullBundle.v2` binding count mismatch investigation:
  `640e6f3d2a365b53a50712d0dfa683463ef4ce0e`.

## Live Diagnostic v3 Result

The live Desktop Operational.5 diagnostic v3 reported:

- schema: `h2o.studio.operational5.live-readonly-canonical-count-parity-diagnostic.v3`
- `classification.overall:"match-with-known-debt"`
- `mismatches:[]`
- `orphanBuckets:[]`
- `notExposed:[]`
- `requiresLiveFollowUp:[]`
- `knownDebt:["rawCanonicalDanglingBindingsFilteredFromExport"]`
- Desktop canonical folders count: `6`
- `fullBundle.v2` folder projection count: `6`
- Desktop raw canonical `folder_bindings` count: `14`
- exportable canonical binding subset count: `12`
- `fullBundle.v2` `canonicalChatFolderBindingProjection` count: `12`
- `fullBundleV2FoldersVsCanonical:"match"`
- `fullBundleV2BindingsVsExportableCanonical:"match"`
- `fullBundleV2RawBindingsDebtRecorded:"known-debt-recorded"`
- `canonicalBindingsVsBindingRepairSnapshot:"match"`
- `receiptsLedgerObserved:"match"`
- `restartConvergenceObserved:"match"`
- restart convergence `ok:true`
- restart convergence `source:"init"`
- restart convergence `checkedCount:2`
- restart convergence `alreadyCurrentCount:2`
- restart convergence `journalVerifiedCount:2`
- restart convergence `blockers:[]`
- restart convergence `warnings:[]`
- `productSyncReady:false`
- `webdavCloudRelay:"blocked"`
- `fullBundle.v3:"not-started"`
- `chatSavingWebdavCloudArchiveCas:"blocked"`
- no writes attempted
- no fallback

## Decision

`match-with-known-debt` is sufficient to clear the `fullBundle.v2` exportable parity issue, because
`fullBundle.v2` now matches the canonical active/exportable binding subset.

It is **not** sufficient to flip global `productSyncReady`.

The Operational.5 flip gate requires source-of-truth reconciliation to be release-grade and canonical
count parity to be proven. The live v3 result still records source-of-truth cleanup debt:

- Desktop raw canonical `folder_bindings`: `14`
- exportable canonical binding subset: `12`
- `fullBundle.v2` exported binding projection: `12`
- known debt: `rawCanonicalDanglingBindingsFilteredFromExport`

The two dangling raw canonical binding rows are not exported and are not a `fullBundle.v2` export bug.
They are documented cleanup/reconciliation debt. Until that debt is either safely cleaned/reconciled
or explicitly superseded by a reviewed source-of-truth readiness decision, the global
`productSyncReady` gate remains blocked.

## productSyncReady Source Procedure

Operational.5 is still controlled by:

- `release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md`
- `tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs`

That procedure defines `productSyncReady` as local v1 single-canonical metadata sync readiness and
requires:

- folder-sync source-of-truth reconciled and release-grade,
- canonical count parity proven,
- no optimistic synced state from request success alone,
- explicit dedicated flip slice.

The current source posture still contains multiple `productSyncReady:false` local readiness,
diagnostic, and transport-boundary literals. A future flip must update only the local readiness
markers that are actually authorized. WebDAV/cloud/relay, `fullBundle.v3`, and Chat Saving CAS remain
separate transport/CAS boundaries and must stay deferred.

## Remaining Blocker

The remaining blocker is **source-of-truth cleanup/reconciliation debt for the two raw canonical
dangling `folder_bindings` rows filtered from export**.

This slice does not perform destructive cleanup and does not authorize deletion or mutation of those
rows. Cleanup/reconciliation needs its own reviewed local slice, starting read-only, before any final
`productSyncReady` flip review can be reopened.

## Boundaries Held

- No product source edited.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No folder/chat/binding/tombstone delete or mutation.
- No fallback added.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and the render-mirror no-write boundary were not weakened.

## Next Step

Next slice: cleanup/reconciliation debt preflight for the two dangling raw canonical binding rows,
read-only first. After that debt is resolved or explicitly superseded, rerun the live Operational.5
parity diagnostic and open a separate final `productSyncReady` flip review. WebDAV/cloud/relay still
waits for a later transport-readiness lane and must not start from this decision.
