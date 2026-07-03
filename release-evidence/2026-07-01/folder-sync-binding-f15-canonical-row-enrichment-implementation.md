# Folder Sync - Binding F15 Canonical-Row Enrichment Implementation

Date: 2026-07-01

Verdict: **BINDING F15 CANONICAL-ROW ENRICHMENT IMPLEMENTED**

This is a source-fix and local proof slice only. No live apply was run. Phase A must be retried after this commit, after independent review.

## Commit Chain

- Binding durable gate implementation: `71616328`
- Busy-aware fence fix: `a2864ad6`
- Rust/writer-authority investigation: `7dd1e069`
- F15-settled repair-write preflight: `44151f14`
- F15-settled repair-write implementation: `ff3ccd44`
- F15 live Phase A proposal blocker evidence: `0b015cc7`

## Prior Live Blocker

Live Phase A dry-run passed, but controlled apply reached F15 delegation and was rejected before any canonical write:

- `controlledApply.status:"rejected"`
- `controlledApply.reason:"canonical-binding-bind-failed"`
- `controlledApply.canonicalBindingWriteCount:0`
- `controlledApply.idempotencyPersisted:false`
- no consumed ledger row
- no Phase B/reload proof

F15 delegation evidence was present but not OK:

- blocker: `f15-folder-binding-proposal-failed`
- proposal operation: `unbind`
- proposal generated: `false`
- proposal/preflight blockers:
  - `library-binding-canonicalization-failed`
  - `library-binding-diagnostics-failed`
  - `library-binding-row-contains-forbidden-field`
  - `library-binding-preflight-not-ok`

The failing diagnostic shape was:

- `sourceKind:"missing"`
- `bindingKindValid:false`
- `endpointTypeConsistent:false`
- `bindingStateValid:false`
- `hashShapeValid:false`
- `relatedCatalogContextSupplied:false`
- `relatedChatContextSupplied:false`
- `siblingBindingContextSupplied:false`

## Root Cause

The F15 folder-binding proposal received envelope-laden compat input instead of a clean canonical chat-folder binding row/context. The prior input mixed proposal pipeline context with the binding shape and did not expose a recognized canonical library.binding source to `generateLibraryBindingProposalCandidate`.

That caused diagnostics to resolve `sourceKind:"missing"` and the F15 preflight to fail closed. The blocker included the forbidden-field family because the row/source was invalid for F15 privacy/canonicalization purposes. F15 chat-folder support itself was not the blocker.

## Fix

The fix is in `src-surfaces-base/studio/store/folders.tauri.js`.

Added helper path:

- `compactF15CanonicalBinding`
- `buildF15CanonicalChatFolderBinding`
- `cleanF15SiblingBindings`

Updated `buildF15FolderBindingDelegationInput` so repair-origin bind/unbind now pass clean canonical chat-folder binding row/context to proposal generation:

- canonical row is supplied as `canonicalBinding`
- `bindingKind:"chat-folder"` is valid
- endpoint types are chat to folder:
  - `leftSubjectType:"chat.metadata"`
  - `rightSubjectType:"folder.metadata"`
- binding state is `bound` for both repair-origin bind and unbind proposal base
- `sourceTag:"desktop"`
- valid `originAccountIdHash`
- valid `subjectId`, `revisionHash`, `leftSubjectId`, `rightSubjectId`, and `sourceTagHash`
- related chat context supplied
- related catalog context explicitly supplied as an empty list because chat-folder has no library catalog endpoint
- sibling context supplied through cleaned canonical binding rows
- materialized cache context supplied as fresh

Pipeline-only fields stay outside the canonical row.

pipeline-only fields stay outside the canonical row:

- `sourceMirror`
- `replayContext`
- `watermarkState`
- `consumedOperationState`
- `actorPeer`
- `ownerStatus`
- `perEnvelopeSalt`

`perEnvelopeSalt` remains available to the shadow/proposal pipeline, but raw endpoint IDs are not exposed as canonical row fields.

## Local Proof

Validator:

`tools/validation/sync/validate-folder-sync-binding-f15-canonical-row-enrichment-implementation.mjs`

The validator loads the real F15 library binding stack:

- `canonicalizeLibraryBinding`
- `diagnoseLibraryBinding`
- `preflightLibraryBinding`
- `generateLibraryBindingProposalCandidate`

Before/failure harness:

- recreates the old repair-origin compat proposal input
- confirms it fails to generate
- confirms `sourceKind:"missing"`
- confirms blockers include:
  - `library-binding-preflight-not-ok`
  - `library-binding-row-contains-forbidden-field`

After/fix harness:

- builds a clean canonical chat-folder binding row
- confirms canonicalization ok
- confirms no forbidden-field-detected
- confirms `sourceKind canonicalBinding`
- confirms `bindingKind chat-folder valid`
- confirms endpoint types chat to folder valid
- confirms `bindingState bound valid`
- confirms hash shape valid
- confirms related chat context supplied
- confirms related catalog context explicitly supplied
- confirms repair-origin unbind proposal `proposal.generated === true`
- confirms repair-origin bind proposal `proposal.generated === true`

## No-Weakening Guard

F15 canonicalizer/preflight/privacy were not weakened.

Confirmed retained:

- `ALLOWED_BINDING_KINDS` still includes the same F15 binding kinds, including `chat-folder`
- forbidden-field scan still exists
- `RAW_ENDPOINT_FIELD_NAMES` still exists
- `forbidden-field-detected` quarantine still exists
- `library-binding-canonicalization-failed` still exists
- `library-binding-diagnostics-failed` still exists
- `library-binding-row-contains-forbidden-field` still exists
- proposal privacy scan still exists

No canonicalizer/preflight/diagnostics/privacy source files were edited in this slice.

## Fallback Guard

No fallback restored.

Confirmed:

- no `allowF7Fallback`
- no `f15AllowF7Fallback`
- no `explicitF7Fallback:true`
- no normal repair call to bare `moveCanonicalChatFolderBinding`
- F15-settled route from `ff3ccd44` remains retained through `useF15FolderBindingDelegation:true`

## Retained Safety

Retained gates:

- busy-aware durable gate remains
- `post-apply-binding-hash-mismatch` remains
- `persistence-verification-failure` remains
- binding apply gate remains `folder-sync-chat-folder-binding-repair-apply`

Boundaries:

- binding-mismatch remains blocked
- `productSyncReady remains false`
- WebDAV/cloud/relay remains blocked
- Chat Saving WebDAV/cloud/archive CAS remains blocked
- no `fullBundle.v3`
- no live apply was run
- Phase B was not run
- no binding allowed-set flip

## Next Step

Recommended next step: independent review, then retry Phase A. Phase A retry must prove dry-run and controlled apply through F15 proposal generation before any Phase B/reload proof or binding allowed-set flip.
