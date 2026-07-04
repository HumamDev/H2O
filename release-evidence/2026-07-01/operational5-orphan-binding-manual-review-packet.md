# Operational.5 - Orphan-Binding Manual Review Packet

Verdict: **OPERATIONAL.5 ORPHAN-BINDING MANUAL REVIEW PACKET RECORDED - CLEANUP APPLY BLOCKED**.

This packet is evidence/validator-only. No cleanup apply was run, no product source was edited, no
folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror state was mutated,
`productSyncReady` remained `false`, WebDAV/cloud/relay/`fullBundle.v3` was not started, Chat Saving
WebDAV/cloud/archive CAS remains blocked/deferred, and no fallback was added.

## Context

- Cleanup command implementation: `9fdf2dab`.
- Tombstone verification fix: `221d91b6`.
- Manual-review blocker decision: `9dd82fdf`.
- Validator cleanup baseline: `3f1bd667`.
- Retained binding/readiness battery before this packet: `68/68` green.

The live cleanup dry-run safe-failed:

- `candidateCount:2`
- `verifiedCount:0`
- `removedCount:0`
- `skippedCount:2`
- status per row: `skipped-not-fully-tombstone-verified`

Automated cleanup is blocked because the current strict verifier requires exact active folder tombstone
evidence and exact active folderBinding tombstone evidence for each raw canonical dangling row. Broad
text matching, loose metadata matching, receipt substring matching, or historical narrative evidence is
not accepted as cleanup proof.

## Rows For Manual Review

Only redacted tokens are recorded. Raw chat ids, raw folder ids, raw chat titles/content, and raw
folder names are not recorded.

| Row token | Chat token | Folder token | Chat live | Strict folder tombstone present | Strict folderBinding tombstone present | Dry-run status |
| --- | --- | --- | --- | --- | --- | --- |
| `row:a950a44b859f` | `r:650c3cb39924` | `r:0226fecaed5b` | `false` | `false` | `false` | `skipped-not-fully-tombstone-verified` |
| `row:fdd2456fc8a2` | `r:2f29d39a6c4f` | `r:2d5469848470` | `true` | `false` | `true` | `skipped-not-fully-tombstone-verified` |

Strict evidence status:

- `row:a950a44b859f`: no strict active folder tombstone and no strict active folderBinding tombstone.
  Automated cleanup must remain blocked. Because `chatLive:false`, this row needs manual provenance
  review before any future cleanup or no-op decision.
- `row:fdd2456fc8a2`: strict active folderBinding tombstone exists, but strict active folder tombstone
  is missing. Automated cleanup must remain blocked. Because `chatLive:true`, the operator must decide
  whether a legitimate folder recovery/restore path exists, whether this row is valid source-of-truth
  debt, or whether later tombstone-backed cleanup can be approved after strict folder tombstone evidence
  is acquired.

## Operator Decision Menu

The operator may choose one of these later, separately reviewed routes:

1. **Keep documented debt and keep `productSyncReady:false`.**
   - Safe default.
   - Leaves raw canonical `folder_bindings` at `14`, exportable canonical bindings at `12`, and
     `fullBundle.v2` binding projection at `12`.
   - No cleanup apply.

2. **Seek missing strict folder tombstone evidence.**
   - Read-only investigation only.
   - Must locate exact active tombstone rows using `record_kind='folder'`,
     `record_id='folder:'+encodeURIComponent(folderId)`, and `restored_at IS NULL`.
   - Broad text matching is not cleanup proof.

3. **Restore folder if legitimate recovery evidence exists.**
   - Relevant especially to the live-chat row `row:fdd2456fc8a2`.
   - Requires a separate reviewed folder restore/reconciliation slice.
   - If a folder is legitimately restored, the corresponding binding row may cease to be dangling and
     must not be removed as orphan cleanup.

4. **Create a future reviewed tombstone-backed cleanup approval.**
   - Only after exact strict folder tombstone and exact strict folderBinding tombstone evidence exist.
   - Must dry-run first.
   - Must apply only under `operational5-orphan-binding-cleanup-apply`.
   - May remove only the exact verified dangling `folder_bindings` rows.

5. **No-op/manual reject.**
   - Operator records that cleanup is not approved.
   - Debt remains documented and `productSyncReady:false` remains.

## Evidence Required Before Cleanup Apply Can Ever Be Approved

Every row proposed for cleanup must satisfy all of the following:

- exact current raw canonical `folder_bindings` row still exists;
- row token matches the reviewed token;
- chat id matches;
- folder id matches;
- `assignedAt` matches if available;
- safe row shape matches expected source/sourceSurface/authority/status/state;
- folder is still missing from the current canonical folder set;
- exact active folder tombstone exists;
- exact active folderBinding tombstone exists;
- neither tombstone is restored;
- no valid/exportable binding would be removed;
- dry-run reports zero writes;
- controlled apply uses `operational5-orphan-binding-cleanup-apply`;
- cleanup receipt records removed count, before/after raw/exportable/fullBundle counts, and safety flags;
- no folder delete, no chat delete, no tombstone delete, no ledger delete, no receipt delete, no purge,
  no import/export mutation, no render-mirror write, no WebDAV/cloud/relay, no Chat Saving CAS, no
  `productSyncReady` flip.

Broad text matching is explicitly rejected as cleanup proof. The authority is strict exact active
tombstone lookup, not substring scans or inferred historical context.

## Boundaries

- No cleanup apply.
- No product source edited.
- No folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror mutation.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and render-mirror no-write boundary remain unchanged.

## Next Step

Manual operator review is next. Cleanup implementation is not run by this packet. A future cleanup or
restore slice must be separately authorized, must start with dry-run, and must preserve
`productSyncReady:false` until a later readiness decision explicitly changes it.
