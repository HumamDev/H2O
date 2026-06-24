# Recently Deleted Folder View Closeout

Date: 2026-06-24

## Commit

- `502c4e7 feat(studio): add recently deleted folder view`

Commit stat:

- 3 files changed
- 598 insertions
- 40 deletions

## Implemented UI

The Recently Deleted folder view is implemented for Desktop Studio as an operator-facing folder lifecycle panel under the Folders sidebar area.

The view includes:

- Desktop-only Recently Deleted folder view under/sidebar Folders area
- retention aggregate counts
- folder tombstone rows
- purge and hard-delete safety labels
- Restore enabled only for rows with `restoreAvailable:true`
- no purge button

Displayed diagnostics include retention counts, tombstone state, restore availability, affected chat count, retention expiration, retention enforcement, purge-blocked state, and hard-delete-blocked state.

## Safety Invariants

- `noHardDelete:true`
- `noPurge:true`
- `noChatDelete:true`
- `noSnapshotDelete:true`
- no WebDAV/cloud behavior
- no Chrome behavior change
- no purge UI path
- no hard-delete UI path

Restore remains gated to the already existing safe Desktop restore API and only appears enabled for `restoreAvailable:true` rows.

## Validation

Passed:

- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- `git show --stat --oneline HEAD --`

`git show --stat --oneline HEAD --` confirmed the scoped implementation commit:

```text
502c4e7 feat(studio): add recently deleted folder view
3 files changed, 598 insertions(+), 40 deletions(-)
```

## Remaining Manual QA

Manual visual QA remains as the next UI-focused step:

- visually confirm the panel renders in Desktop Studio
- confirm tombstone rows appear
- confirm retention aggregates appear
- confirm Restore visibility/disabled state is correct
- confirm there is no flicker or full-page shake
- confirm no purge or hard-delete action appears

## Recommendation

Next phase should be visual QA and small UI polish only if needed.

Do not start purge or WebDAV/cloud/relay work from this closeout. Purge remains explicitly deferred.
