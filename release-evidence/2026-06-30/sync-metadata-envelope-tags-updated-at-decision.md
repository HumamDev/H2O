# Sync Metadata Envelope tags.updated_at Decision

Status: TAGS updated_at DECISION — DEFER MIGRATION TO MULTI-WRITER; v3 single-canonical unaffected; productSyncReady:false

Date: 2026-06-30

## Investigation Summary

Tags are renameable. The metadata/catalog model includes a `tag-rename` catalog operation, and the tags store updates tag rows through upsert/update behavior.

Runtime `tags` currently has no `updated_at` column. A tag rename can therefore change `name` without recording a mutation timestamp on the tag row.

Current migration work is already flagged with f17/v13 drift, and the current max migration is v17. Adding `tags.updated_at` would be a new v18 migration.

A6 and A7 already record this gap explicitly:

- A6 keeps `projection.tags[].updatedAt` optional or absent.
- A7 validates that runtime `tags` has no `updated_at` and treats that as an explicit pre-freeze gap, not an accidental omission.

## Decision

Defer the `tags.updated_at` migration to the future multi-writer / multi-Desktop LWW authority slice.

This is not a blocker for a future `fullBundle.v3` mint under the current single-canonical Desktop authority model.

A6 authority model remains:

```json
{
  "canonicalRole": "desktop",
  "authorityEpoch": 0
}
```

Under single-canonical authority, the Desktop projection is truth. No per-tag LWW conflict basis is consulted. Future v3 should keep `tags.updatedAt` optional or absent until runtime has a real field.

## Rejected Alternatives

Do not freeze `createdAt` as the hard tag LWW basis.

Reason: tags are renameable, and `createdAt` is blind to renames.

Do not synthesize `updatedAt`.

Reason: there is no rename timestamp to derive from. Synthesis would imply precision the runtime does not have.

## Sequencing

The `tags.updated_at` migration belongs to the future multi-writer / multi-Desktop authority slice.

It should be coordinated with the migration lane and should land after or with the f17 v13 migration-drift fix.

Do not add v18 while the migration chain is still flagged as drifting.

## Future Migration Plan

Not implemented now.

Future v18 migration:

```sql
ALTER TABLE tags ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
```

Backfill:

```sql
UPDATE tags SET updated_at = created_at WHERE updated_at = 0;
```

Future tags store write path:

- set `updated_at = now()` on insert
- set `updated_at = now()` on upsert
- set `updated_at = now()` on rename
- add a live-population guard so the column is not backfilled and forgotten

## Future Validator / Harness Plan

Now:

- keep A5/A7 `tags.updated_at` gap explicit
- assert v3 does not declare `createdAt` as the tag LWW basis
- keep `tags.updatedAt` optional

Later with v18:

- drift guard requires `tags.updated_at` in schema
- projection includes `tags.updatedAt`
- tags store write-path guard proves `updated_at` is set on writes
- deterministic harness proves rename advances `updated_at`
- multi-writer LWW harness proves higher `(authorityEpoch, updatedAt)` wins

## Risk Summary

Tag rename/edit:

- safe under single-canonical Desktop authority
- unsafe under multi-writer authority without migration

Auto-derived tags:

- same rule as user-created tags

Read-only WebDAV projection:

- unaffected while authority remains single-canonical

Deterministic `payloadHash`:

- unaffected because the field is optional/absent and honestly modeled

LWW by authority:

- honest under single-canonical authority
- requires migration before multi-writer authority

## Boundaries

- Docs/evidence only.
- No migration implementation.
- No tags schema change.
- No tags store change.
- No `h2o.studio.fullBundle.v3` mint.
- No metadata envelope freeze.
- No `productSyncReady` flip.
- No validator implementation.
- No WebDAV implementation.
- No identity/key runtime.
- No f17 migration drift change.
- No capability change.
- No Chrome runtime/service-worker change.
- No archive package CAS change.
- No sync/appearance/ribbon dirty-file change.
- No `stash@{0}` change.
- Leave unrelated staged/unstaged files untouched.

## Recommended Next Step

Keep the A5/A7 gap assertions in place. Before opening multi-writer authority, resolve the migration lane drift and then add the v18 `tags.updated_at` migration with write-path and LWW harness coverage.
