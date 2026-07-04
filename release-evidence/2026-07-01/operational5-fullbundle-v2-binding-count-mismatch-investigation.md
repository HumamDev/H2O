# Operational.5 - fullBundle.v2 Binding Count Mismatch Investigation

Verdict: **OPERATIONAL.5 FULLBUNDLE.V2 BINDING COUNT MISMATCH CLASSIFIED**.

Live Operational.5 diagnostic v2 after commit `90b633052ea86de3b192490f59482613a92eaa27`
reported:

- `classification.overall:"mismatch"`
- `mismatches:["fullBundleV2BindingsVsCanonical"]`
- Desktop canonical `folder_bindings` count: `14`
- Desktop canonical binding hash:
  `sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`
- `fullBundle.v2` canonical chat-folder binding projection count: `12`
- `fullBundle.v2` active binding count: `12`
- `fullBundle.v2` diagnostics:
  - `missingFolderBindingCount:2`
  - `fallbackUnfiledBindingCount:2`
  - `activeDanglingFolderBindingCount:2`
  - `deletedFolderBindingCount:0`
  - `restoredFolderBindingCount:0`
  - `blockers:[]`
  - `warnings:[]`
  - `canonicalBindingAuthority:"desktop-sqlite"`
  - `fallbackUsed:false`
  - `fallbackBindingAuthority:false`

## Classification

The 14-vs-12 gap is **expected export filtering that exposes canonical cleanup debt**, not a
`fullBundle.v2` export bug.

The two extra raw canonical rows are active dangling chat-folder bindings whose `folder_id` is not
present in the current canonical folder list. The `fullBundle.v2` projection intentionally excludes
those rows from the exported active binding projection and counts them as:

- `missingFolderBindingCount`
- `fallbackUnfiledBindingCount`
- `activeDanglingFolderBindingCount`

No deleted-folder binding was exported as active.

## Source Anchor

`src-surfaces-base/studio/ingestion/export-bundle.tauri.js` builds the canonical binding projection
by reading `store.folders.listCanonicalChatFolderBindings()`, then:

- increments `missingFolderBindingCount`, `fallbackUnfiledBindingCount`, and
  `activeDanglingFolderBindingCount` when a canonical binding references a folder missing from the
  current folder list;
- returns early for that row, so it is not pushed into the exported active `bindings` array;
- increments `deletedFolderBindingCount` and excludes active-deleted folder rows separately;
- only pushes rows that are active and exportable.

## Operational.5 Parity Target

Operational.5 must compare:

- raw Desktop canonical `folder_bindings` count/hash as a source-of-truth diagnostic, and
- `fullBundle.v2` binding count/hash against the **canonical active/exportable subset**, not raw
  canonical rows that the export safety filter explicitly excludes.

Raw canonical dangling rows remain reported separately as cleanup/reconciliation debt. This slice
does not delete or repair those rows.

## Diagnostic Update

`release-evidence/2026-07-01/operational5-live-readonly-canonical-count-parity-diagnostic.md` now
computes:

- raw canonical binding count/hash;
- canonical exportable active binding count/hash;
- missing-folder binding count;
- active-deleted-folder binding count;
- active-dangling binding count;
- fallback-unfiled binding count.

The `fullBundle.v2-readonly-projection-diagnostic` surface now compares the `fullBundle.v2`
projection against the canonical exportable active subset while keeping raw canonical rows visible.

## Boundaries

- No productSyncReady flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No folder/chat/binding delete.
- No destructive cleanup.
- No fallback.
- No weakening of durable/hash gates, conflict runtime, `requireContext`, restart convergence,
  reviewed request path, or render-mirror no-write boundary.

## Next Step

Rerun the live Desktop Operational.5 read-only diagnostic. Expected outcome for this specific issue:
`fullBundle.v2-readonly-projection-diagnostic` should match the canonical exportable active subset,
while `desktop-canonical-binding-exportability` should continue to report the raw dangling-row debt
if the two missing-folder rows are still present.
