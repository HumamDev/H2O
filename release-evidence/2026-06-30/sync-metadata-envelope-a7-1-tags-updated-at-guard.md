# Sync Metadata Envelope A7.1 tags.updated_at Guard

Status: A7.1 TAGS updated_at GUARD - PRE-FREEZE PASSED

Date: 2026-06-30

## Scope

A7.1 locks the `tags.updated_at` sequencing decision into the existing A7
field-contract harness.

A7.1 is validator/evidence only.

## Guard Summary

Updated validator:

- `tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs`

The guard now verifies:

- the `tags.updated_at` decision note exists
- migration is deferred to the multi-writer / multi-Desktop LWW authority slice
- future v3 under single-canonical Desktop authority is unaffected
- `productSyncReady:false` remains
- `createdAt` is rejected as a hard tag LWW basis
- synthesized `updatedAt` is rejected
- future v18 migration belongs later, after/with f17/v13 migration-drift repair
- current sample tags do not require or generate `updatedAt`
- runtime schema/store still has no `tags.updated_at`
- no v18 migration is introduced by this slice

## Decision Locked

The locked decision is:

- keep `tags.updatedAt` optional or absent while current authority is single-canonical Desktop
- do not require `tags.updated_at` before future v3 mint under that authority model
- do not use `createdAt` as a hard tag LWW basis
- do not synthesize `updatedAt`
- defer the real migration/write-path/LWW harness to the future multi-writer authority slice

## Current Gap Remains Explicit

Runtime `tags` has no `updated_at`.

A7.1 keeps that gap visible. It does not migrate schema, update the tags store,
or alter the future v3 field contract.

## Future Sequencing

Future v18 work should:

- add `tags.updated_at`
- backfill from `created_at`
- set `updated_at` on insert/upsert/rename
- prove live population
- prove rename advances `updated_at`
- prove multi-writer LWW on `(authorityEpoch, updatedAt)`

This belongs after/with the f17/v13 migration-drift fix.

## Validation

Commands:

```sh
node --check tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs
node tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs
node tools/validation/studio/validate-sync-metadata-projection-closure-v1.mjs
node tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs
git diff --check
git diff --cached --check
git diff --cached --name-only
```

Result:

- passed

## Files Changed

- `tools/validation/studio/validate-sync-metadata-v3-projection-field-contract-v1.mjs`
- `release-evidence/2026-06-30/sync-metadata-envelope-a7-1-tags-updated-at-guard.md`

## Boundaries

- no `tags.updated_at` migration
- no tags schema change
- no tags store change
- no `h2o.studio.fullBundle.v3` mint
- no metadata envelope freeze
- no `productSyncReady` flip
- no WebDAV implementation
- no identity/key runtime
- no f17 migration drift change
- no capability change
- no Chrome runtime/service-worker change
- no archive package CAS change
- unrelated staged/unstaged files left untouched
