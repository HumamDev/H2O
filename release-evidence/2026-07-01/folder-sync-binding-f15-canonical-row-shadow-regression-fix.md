# Folder Sync Binding F15 Canonical-Row Shadow Regression Fix

Date: 2026-07-01

## Verdict

BINDING F15 CANONICAL-ROW SHADOW REGRESSION FIXED.

## Commit Context

- F15-settled repair-write implementation: `ff3ccd44`
- F15 live Phase A proposal blocker evidence: `0b015cc7`
- F15 canonical-row enrichment implementation: `501635ae865b460ac0bb4e0cb4e5d6196714022d`

## Regression

Commit `501635ae865b460ac0bb4e0cb4e5d6196714022d` correctly fixed the F15 proposal canonical-row shape by placing clean chat-folder subject fields under `input.canonicalBinding`.

The proposal path was corrected, but the migration shadow consumer was missed. `runF15FolderBindingDelegationPipeline()` still read the removed top-level fields:

- `input.leftSubjectId`
- `input.rightSubjectId`

The real shadow step requires sha256 subject hashes. With the new input shape, those top-level fields are undefined, so the real pipeline would fail before proposal generation with:

- `missing-chat-subject-hash`
- `missing-folder-subject-hash`
- pipeline blocker: `f15-folder-binding-shadow-failed`

## Fix

`runF15FolderBindingDelegationPipeline()` now reads the shadow subject IDs from the clean canonical row:

- `input.canonicalBinding.leftSubjectId`
- `input.canonicalBinding.rightSubjectId`

The pipeline also fails safely with `f15-folder-binding-canonical-row-invalid` if the canonical row or its subject hashes are missing or invalid. This keeps pipeline fields separate from the clean canonical row and does not reintroduce top-level raw subject fields into the canonicalizer/proposal path.

## Proof

The F15 canonical-row enrichment validator now proves shadow plus proposal behavior, not proposal-only behavior:

- the old removed top-level subject path fails with `missing-chat-subject-hash` and `missing-folder-subject-hash`;
- the patched canonical-row subject path produces shadow `ok:true`;
- repair-origin `unbind` proposal generation still succeeds;
- repair-origin `bind` proposal generation still succeeds;
- no forbidden-field quarantine returns for the clean canonical row;
- F15 canonicalizer, preflight, diagnostics, and privacy rules were not weakened.

## Boundaries

- No fallback was restored.
- No `allowF7Fallback` or `f15AllowF7Fallback` was added.
- No bare `moveCanonicalChatFolderBinding` repair route was restored.
- No live apply was run.
- Phase A was not retried.
- Phase B was not run.
- `binding-mismatch` remains blocked.
- `productSyncReady` remains false.
- WebDAV/cloud/relay/fullBundle.v3 remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Phase A retry remains blocked until this fix commit lands and receives quick independent review.
