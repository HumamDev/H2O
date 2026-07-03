# Folder Sync - Binding F15 Live Phase A Proposal Blocked

Verdict: **BINDING F15 LIVE PHASE A BLOCKED AT PROPOSAL GENERATION**.

This is design-only evidence and preflight. No product source was edited, no live retry was run, no Phase B was
started, no binding allowed-set flip was performed, and no fallback was reintroduced.

## Commit Chain

- Binding durable gate implementation: `71616328`.
- Busy-aware fence fix: `a2864ad6`.
- Rust/writer-authority investigation: `7dd1e069`.
- F15-settled repair-write preflight: `44151f14`.
- F15-settled repair-write implementation: `ff3ccd44`.

## Live Phase A Dry-Run

The live Desktop Phase A dry-run reached the binding repair handler and passed as a dry-run:

- `schema:"h2o.studio.folder-sync.binding-f15-settled-live-proof.v1"`.
- `phase:"A-dry-run-only"`.
- `candidateFound:true`.
- `validate.ok:true`.
- `dryRun.status:"dry-run"`.
- `dryRun.reason:"dry-run-binding-repair-plan-ready"`.
- `dryRun.canonicalBindingWriteCount:0`.
- `dryRun.idempotencyPersisted:false`.
- `dryRun.bindingHashUnchanged:true`.
- `beforeBindingHash:"sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d"`.
- `requestedBindingHash:"sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e"`.

## Live Phase A Controlled Apply Result

The controlled apply did not apply:

- `controlledApply.status:"rejected"`.
- `controlledApply.reason:"canonical-binding-bind-failed"`.
- `controlledApply.canonicalBindingWriteCount:0`.
- `controlledApply.idempotencyPersisted:false`.
- `afterBindingHash` remained the old hash.
- `immediateReadbackMatchesRequested:false`.
- `duplicateReplayZeroWrite:false` because the first apply never succeeded.

No canonical binding write landed. No consumed ledger row was inserted for this attempt. Phase B/reload proof must not
run because Phase A did not apply.

## F15 Delegation Blocker Capture

The live diagnostic capture proved the repair reached F15 delegation and failed inside the F15 library-binding
proposal/preflight pipeline:

- `schema:"h2o.studio.folder-sync.f15-delegation-blocker-capture.v1"`.
- `diagnosticOnly:true`.
- `evidencePresent:true`.
- `ok:false`.
- `blockerCount:1`.
- `blockers:["f15-folder-binding-proposal-failed"]`.
- `resultRedacted.shadow.ok:true`.
- `resultRedacted.shadow.created:false`.
- `resultRedacted.shadow.alreadyPresent:true`.
- `resultRedacted.proposal.ok:false`.
- `resultRedacted.proposal.status:"blocked"`.
- `resultRedacted.proposal.generated:false`.
- `resultRedacted.proposal.operation:"unbind"`.
- `resultRedacted.proposal.preflight.ok:false`.
- `resultRedacted.proposal.preflight.actionable:false`.
- `resultRedacted.proposal.preflight.operation:"unbind"`.

Proposal/preflight blocker codes:

- `library-binding-canonicalization-failed`.
- `library-binding-diagnostics-failed`.
- `library-binding-row-contains-forbidden-field`.
- `library-binding-preflight-not-ok`.

Proposal diagnostics:

- `sourceKind:"missing"`.
- `bindingKindValid:false`.
- `endpointTypeConsistent:false`.
- `bindingStateValid:false`.
- `hashShapeValid:false`.
- `relatedCatalogContextSupplied:false`.
- `relatedChatContextSupplied:false`.
- `siblingBindingContextSupplied:false`.

## Interpretation

The F15-settled repair-write patch worked far enough to route the repair into F15 delegation. The failure is not a
silent no-op and not a bare `moveCanonicalChatFolderBinding` fallback. It is an F15 proposal-generation/preflight
failure for the `unbind` part of the bind/rebind decomposition.

The likely source-level cause is an under-contexted and under-shaped `unbind` proposal input:

- `delegateF15FolderBindingWrite('bind', ...)` decomposes a rebind into `delegateF15FolderBindingWrite('unbind', previousFolderId, chatId, ...)` before the new bind.
- `buildF15FolderBindingDelegationInput(...)` builds a generic delegation object from hashed legacy chat/folder endpoints, but it does not supply a canonical `library.binding` row, canonicalizer result, or diagnostics result for the existing settled binding.
- The F15 proposal/preflight stack expects a valid redacted canonical `library.binding` shape or a raw row that the canonicalizer can safely convert. Missing canonical source is reported as `sourceKind:"missing"`, and invalid/privacy-sensitive row shape is reported through `library-binding-canonicalization-failed`, `library-binding-diagnostics-failed`, and `library-binding-row-contains-forbidden-field`.
- The live diagnostics also show missing related catalog/chat/sibling context. Those are part of the safe proposal context and should be supplied for repair-origin F15 proposals, especially for a rebind decomposition where the unbind must be tied to the existing settled binding row.

The safest conclusion is that the repair is now blocked before canonical write because the F15 unbind proposal is not
being generated from the existing settled binding row / canonical library-binding identity.

## Source Areas Inspected

`src-surfaces-base/studio/store/folders.tauri.js`:

- `delegateF15FolderBindingWrite`
- `buildF15FolderBindingDelegationInput`
- `runF15FolderBindingDelegationPipeline`
- `bindChat`
- `unbindChat`
- rebind decomposition path
- `listForChat`
- `listCanonicalChatFolderBindings`
- `listCanonicalChatFolderBindingsForChat`
- current binding lookup before unbind

F15 proposal/preflight source:

- `src-surfaces-base/studio/sync/library/library-binding-proposal-candidate-generator.tauri.js`
  - `generateLibraryBindingProposalCandidate`
  - `runPreflight`
  - `bindingFromPreflight`
  - proposal shape validation
- `src-surfaces-base/studio/sync/library/library-binding-preflight.tauri.js`
  - `preflightLibraryBinding`
  - `resolveDiagnostics`
  - context gates for related catalogs/chats/sibling bindings
  - `library-binding-preflight-not-ok`
- `src-surfaces-base/studio/sync/library/library-binding-diagnostics.tauri.js`
  - `diagnoseLibraryBinding`
  - `resolveBinding`
  - canonical shape checks
  - privacy/forbidden-field checks
- `src-surfaces-base/studio/sync/library/library-binding-canonicalizer.tauri.js`
  - `canonicalizeLibraryBinding`
  - raw endpoint field quarantine
  - `h2o.library.binding.v1`
- `src-surfaces-base/studio/sync/library/library-folder-binding-migration-shadow.tauri.js`
  - `createLibraryFolderBindingMigrationShadow`
  - F15 folder-binding delegation enablement

## Fix Direction Preflight

Recommended next step: **F15 proposal/preflight fix design**.

The safest source-fix direction is to enrich the F15 delegation input for repair-origin bind/rebind/unbind, not to
relax proposal safety gates:

1. Construct the `unbind` proposal from the existing settled binding row or a freshly shaped canonical
   `library.binding` row for the current chat-folder binding.
2. Supply a valid `canonicalBinding` or `canonicalizerResult` to `generateLibraryBindingProposalCandidate`.
3. Supply required redacted context:
   - related folder/catalog context for the folder endpoint,
   - related chat context for the chat endpoint,
   - sibling binding context for one-folder-per-chat conflict detection.
4. Preserve F15 migration shadow linkage and use `libraryBindingSubjectId` / canonical `subjectId` shape instead of
   legacy F7/F13 raw endpoint IDs.
5. Keep the F15 proposal/preflight privacy and canonicalization checks strict.
6. Consider a repair-specific settled move/rebind operation only if the existing `unbind` + `bind` decomposition cannot
   safely supply the existing settled binding row and related context.

Rejected fix directions:

- Do not add `allowF7Fallback` or `f15AllowF7Fallback`.
- Do not restore a bare `moveCanonicalChatFolderBinding` repair route.
- Do not weaken `library-binding-row-contains-forbidden-field`.
- Do not weaken `library-binding-canonicalization-failed` or `library-binding-diagnostics-failed`.
- Do not run Phase B or reload proof until Phase A applies.
- Do not perform a binding allowed-set flip.

## Boundaries Held

- No canonical binding write landed.
- No ledger consume happened.
- No live retry happened in this slice.
- No Phase B was run.
- No fallback was reintroduced.
- `binding-mismatch` remains blocked.
- `productSyncReady:false`.
- WebDAV/cloud/relay remains `blocked`.
- Chat Saving WebDAV/cloud/archive CAS remains `blocked`.

## Next Step

Prepare an F15 proposal/preflight fix design that proves exactly how repair-origin chat-folder binding rows are shaped
into F15 `library.binding` canonical/proposal input, then get review before any product-source implementation or live
retry.
