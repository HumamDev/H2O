# Operational.5 - Orphan-Binding Strict Evidence Receipt Design

Verdict: **OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT DESIGN READY - CLEANUP STILL BLOCKED**.

This is a design/preflight slice only. No cleanup apply was run, no product source was edited, no
folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror state was mutated,
`productSyncReady` remained `false`, WebDAV/cloud/relay/`fullBundle.v3` was not started, Chat Saving
WebDAV/cloud/archive CAS remains blocked/deferred, no fallback was added, and strict tombstone
verification was not weakened.

## Context

- Live provenance diagnostic prep: `da77730465dd2db272a6e392640c55c682655a9d`.
- Read-only provenance search: `2ecfbd81eddbef72b6f3c626ce503b33939291c4`.
- Manual-review packet: `b344120ac4462b6e91f7ac6bfb4cff507cab0a68`.
- Cleanup command implementation: `9fdf2dab`.
- Tombstone verification fix: `221d91b6`.
- Manual-review blocker decision: `9dd82fdf`.
- Current retained binding/readiness baseline before this slice: `73/73` green.

Live provenance diagnostic output:

- schema: `h2o.studio.operational5.orphan-binding-live-provenance-diagnostic.v1`
- canonical folders: `6`
- raw canonical `folder_bindings`: `14`
- exportable canonical bindings: `12`
- dangling bindings: `2`
- tombstones observed: `20`
- receipts observed: `1`
- exact strict folder tombstone count: `0`
- exact strict folderBinding tombstone count: `1`
- both strict evidence count: `0`
- chat live count: `1`
- recommended next route: `D.create-new-strict-evidence-receipt`
- no writes attempted
- no cleanup attempted
- `productSyncReady:false`
- WebDAV/cloud/relay/`fullBundle.v3`: not started
- Chat Saving CAS: blocked/deferred

## Row Decisions

| Row token | Chat token | Folder token | Chat live | Exact folder tombstone | Exact folderBinding tombstone | Route |
| --- | --- | --- | --- | --- | --- | --- |
| `row:a950a44b859f` | `r:650c3cb39924` | `r:0226fecaed5b` | `false` | `false` | `false` | `A.keep-documented-debt` |
| `row:fdd2456fc8a2` | `r:2f29d39a6c4f` | `r:2d5469848470` | `true` | `false` | `true` | `D.create-new-strict-evidence-receipt` |

`row:a950a44b859f` remains documented debt. It has no live chat, no exact folder tombstone, and no
exact folderBinding tombstone. It is not eligible for strict evidence receipt implementation, cleanup,
restore, or unbind/rebind without stronger future evidence.

`row:fdd2456fc8a2` is eligible only for a strict evidence receipt design/implementation because the
chat is live and the exact active folderBinding tombstone exists, but the exact active folder tombstone
is missing. This does **not** approve cleanup.

## Strict Evidence Receipt Meaning

A strict evidence receipt for `row:fdd2456fc8a2` is an operator-reviewed, read-first receipt that records
the live facts needed for a later reviewed decision. It is **not** a folder tombstone, does **not**
mutate tombstones, and does **not** substitute automatically for the missing exact active folder
tombstone.

The receipt may become a prerequisite for a later manual-approval cleanup override only if a separate
slice explicitly authorizes that override. Until then, `operational5OrphanBindingCleanup` must continue
to require exact active folder tombstone and exact active folderBinding tombstone evidence.

Design decision: **B. manual-approval prerequisite for a later cleanup**, not A evidence-only forever,
not C tombstone substitute, not D reviewed unbind-to-Unfiled, and not cleanup authorization.

## Required Receipt Fields

The future strict evidence receipt for `row:fdd2456fc8a2` must be redacted/hash-only and must include:

- schema, for example `h2o.studio.operational5.orphan-binding-strict-evidence-receipt.v1`;
- `rowToken:"row:fdd2456fc8a2"`;
- `chatToken:"r:2f29d39a6c4f"`;
- `folderToken:"r:2d5469848470"`;
- exact folderBinding tombstone record token;
- exact folder tombstone record token that was checked;
- `exactFolderTombstonePresent:false`;
- `exactFolderBindingTombstonePresent:true`;
- `chatLive:true`;
- `folderAbsentFromCanonicalFolders:true`;
- row safe-shape summary:
  - source/sourceSurface/authority/status/state are the approved desktop-canonical active shape;
  - no hard delete;
  - no purge;
  - no chat delete;
- no exportable binding removal;
- canonical counts before any later action:
  - raw canonical bindings `14`;
  - exportable canonical bindings `12`;
  - `fullBundle.v2` binding projection `12`;
- `broadMatchingAcceptedAsCleanupProof:false`;
- `cleanupApplyApproved:false`;
- `tombstoneSubstitute:false`;
- `manualApprovalRequiredBeforeAnyCleanup:true`;
- boundary flags:
  - no folder delete;
  - no chat delete;
  - no tombstone mutation;
  - no ledger mutation;
  - no receipt deletion;
  - no import/export mutation;
  - no render-mirror write;
  - no WebDAV/cloud/relay;
  - no Chat Saving CAS;
  - `productSyncReady:false`.

The receipt must not log raw chat ids, raw folder ids, raw chat titles/content, raw folder names, or raw
idempotency keys.

## Future Validator / Live Proof Requirements

Before any future cleanup apply can be reconsidered, a later implementation must prove:

1. strict evidence receipt creation is read-only or append-only to the explicit reviewed receipt store
   only, never a canonical binding/tombstone mutation;
2. the receipt records exact folderBinding tombstone presence for `row:fdd2456fc8a2`;
3. the receipt records exact folder tombstone absence for `row:fdd2456fc8a2`;
4. the receipt records chat liveness and folder absence without raw ids/names/content;
5. the receipt does not weaken `operational5OrphanBindingCleanup`;
6. cleanup remains blocked unless a separate manual-approval cleanup override is designed and approved;
7. `row:a950a44b859f` remains documented debt and is not swept into the receipt path;
8. no folder/chat/tombstone/ledger/import/export/render-mirror mutation happens;
9. `productSyncReady:false`, WebDAV/cloud/relay deferred, and Chat Saving CAS blocked/deferred remain.

## Boundaries

- Controlled cleanup apply remains blocked.
- No cleanup apply.
- No product source edited.
- No folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror mutation.
- No strict tombstone verification weakening.
- No broad text/meta/receipt matching accepted as cleanup proof.
- No tombstone substitute is minted in this design.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and render-mirror no-write boundary remain unchanged.

## Next Step

If approved, the next implementation slice is a strict evidence receipt creation path for
`row:fdd2456fc8a2` only. That implementation must remain separate from cleanup apply and must not
authorize cleanup by itself. `row:a950a44b859f` remains documented debt unless stronger future evidence
appears.
