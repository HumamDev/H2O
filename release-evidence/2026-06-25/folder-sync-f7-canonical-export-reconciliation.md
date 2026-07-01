# Folder Sync F7 - Canonical Export Reconciliation

FOLDER SYNC F7 CANONICAL EXPORT RECONCILIATION - IMPLEMENTED

## Purpose

F7 reconciles the Desktop export/publish path with the F1/F2 source-of-truth decision: Desktop SQLite remains canonical for folder catalog rows and chat-folder bindings, while the legacy `FOLDER_STATE_DATA_KEY` mirror remains a derived/cache surface.

This slice does not make folder sync product-ready. It removes a stale projection authority path from Desktop export so the next parity proof can compare canonical counts without the export layer reintroducing mirror bindings.

## Source-of-truth findings

- Canonical folder catalog and binding state lives in Desktop SQLite through `H2O.Studio.store.folders`.
- Canonical binding readers already exist:
  - `listCanonicalChatFolderBindings()`
  - `listCanonicalChatFolderBindingsForChat(chatId)`
  - `getCanonicalChatFolderBindingForChat(chatId)`
- The Desktop bundle exporter already published `desktopCanonicalChatFolderBindings`, but `folderState.items` could still merge stale mirror bindings from `FOLDER_STATE_DATA_KEY`.
- `collectRelated()` could also resolve per-chat folder organization from the mirror if thinner canonical paths did not return a folder row.

## Patch summary

- `mergeFolderStates()` now skips fallback mirror bindings instead of merging them into exported `folderState.items`.
- The folder-state mirror remains a fallback for visual metadata only.
- Stale mirror bindings are skipped.
- Fallback mirror data can only fill visual metadata for a canonical folder row, such as missing color/icon values.
- Export diagnostics now record:
  - `skippedFallbackBindingCount`
  - `fallbackBindingAuthority:false`
  - `fallbackItemsMerged:false`
  - `canonicalBindingAuthority:"desktop-sqlite"`
- `collectRelated()` now tries the canonical per-chat folder binding reader before any mirror fallback.
- Mirror folder lookup is gated behind the absence of a canonical Desktop folder store, so a live Desktop export does not silently promote stale mirror bindings.

## Canonical count parity

Canonical count parity is proven for the Desktop export path by static and deterministic validator coverage:

- exported `folderState.items` binding count equals the Desktop canonical binding input count
- stale mirror binding rows are counted as skipped, not merged
- `desktopCanonicalChatFolderBindings` remains sourced from `store.folders.listCanonicalChatFolderBindings()` when available

Live Chrome/Desktop runtime parity remains the next smoke/proof step after this export reconciliation, because this slice does not run a live Desktop/Chrome pair.

## Boundaries

- productSyncReady remains false.
- `productSyncReady` remains false.
- `fullBundle.v3` is not minted.
- WebDAV/cloud transport remains deferred.
- Archive package CAS remains untouched.
- Chat Saving / `.h2ochat` archive code remains untouched.
- No multi-writer, lease/election, catalog CRUD, hard-delete, or un-delete behavior is implemented.
- No Chrome runtime/service-worker code is changed.

## Validation

Validation passed:

- `node --check src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- `node --check tools/validation/sync/validate-folder-sync-f7-canonical-export-reconciliation.mjs`
- `node tools/validation/sync/validate-folder-sync-f7-canonical-export-reconciliation.mjs`
- `node tools/validation/sync/validate-folder-sync-f1-source-of-truth-reconciliation.mjs`
- `node tools/validation/sync/validate-folder-sync-f2-source-of-truth-drift-detector.mjs`
- `node tools/validation/sync/validate-folder-sync-f3-read-only-live-drift-probe.mjs`
- `node tools/validation/sync/validate-folder-sync-f4-runtime-drift-probe-design-gate.mjs`
- `node tools/validation/sync/validate-folder-sync-f5-desktop-runtime-drift-probe.mjs`
- `node tools/validation/sync/validate-folder-sync-f6-desktop-runtime-drift-live-evidence.mjs`
- `node tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs`
- `node tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs`
- `node tools/validation/studio/validate-sync-operational-label-tag-unbind-harness-v1.mjs`
- `node tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs`
- `node tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs`
- `node tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs`
- `node tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs`
- `node tools/validation/studio/validate-sync-identity-key-e2e-boundary-v1.mjs`
- `git diff --check`
- `git diff --cached --check`

F1 validator compatibility note: F1 remains a historical source-of-truth evidence guard for the original four-type metadata core, while the validator now accepts the current committed six-type Operational runtime allowlist.
