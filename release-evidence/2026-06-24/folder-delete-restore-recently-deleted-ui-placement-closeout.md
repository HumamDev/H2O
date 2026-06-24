# Recently Deleted UI Placement Closeout

Date: 2026-06-24

## Verdict

Recently Deleted folder UI placement is corrected and evidence-backed.

Implementation commit:

- `28f4d5c57a1c69949958b477ce71eba583720b5c` - moved Recently Deleted view to Folders page

## Before

The full Recently Deleted tombstone list rendered inside the left folders sidebar.

Visual QA found this placement made the sidebar cramped and confusing because it mixed a dense operator recovery list with lightweight navigation.

## After

The sidebar now shows only a compact entry:

- `Recently Deleted · <count>`

The full Recently Deleted panel now renders in the main Folders page/body.

The main page panel preserves:

- tombstone rows
- retention aggregates
- restore status
- `restoreAvailable`
- retention countdown diagnostics
- purge/hard-delete safety labels
- safe restore action where `restoreAvailable:true`

## Safety Preserved

No destructive behavior was added:

- no purge button
- no hard delete
- no WebDAV/cloud/relay
- no Chrome behavior change
- no chat deletion
- no snapshot deletion

## Validation Summary

Passed validation:

- `npm run dev:all`
- `node apps/studio/desktop/build-tools/prepare-dist.mjs`
- `node --check` on changed JS/MJS
- `node tools/validation/sync/validate-folder-recently-deleted-ui-polish.mjs`
- existing sync validators for retention 4E, delete/restore 4D.4, delete request 4C, and restore receipt 4D
- prepared asset marker check
- `git diff --check`
- `git diff --cached --check`

## Manual Visual QA Checklist

Operator visual QA should confirm:

- sidebar has compact Recently Deleted entry only
- main Folders page shows the full Recently Deleted panel
- restore button appears/enables only where safe
- safety labels are visible
- no flicker or full-page shake occurs

## Recommendation

Next step should be manual visual QA.

If the placement is visually accepted, move to a release readiness checkpoint for the sync milestone.

Do not start purge or WebDAV/cloud/relay implementation yet.
