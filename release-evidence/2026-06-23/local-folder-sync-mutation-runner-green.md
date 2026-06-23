# Local Folder Sync Mutation Runner Green Result

Date: 2026-06-23

## Purpose

Record the final Slice 5B closeout result for the combined local Chrome <-> Desktop folder-sync mutation smoke runner. This covers create, rename, and color propagation only.

## Prior Proof

The manual create/rename/color mutation proof was already green and documented in:

- `release-evidence/2026-06-23/local-folder-sync-manual-mutation-roundtrip.md`

That proof established:

- Chrome `createFolder` -> Desktop visibility.
- Desktop `renameFolder` -> Chrome visibility.
- Chrome `setFolderColor` -> Desktop visibility.
- Desktop `setFolderColor` -> Chrome visibility.
- Deferred propagation warnings were non-blocking when blockers were empty.

## Runner Commits

- `88c5ed0 feat(sync): add local folder sync mutation smoke runner`
- `22f93e6 fix(sync): harden mutation smoke runner sequencing`

## Initial Runner Failure

The first combined runner attempt was blocked even though the manual flow had passed. The root cause was runner sequencing, not product sync behavior:

- The runner advanced before Desktop had imported and surfaced the Chrome-created folder.
- The runner continued after required verification failed, which caused cascading rename/color failures.
- The rapid Desktop-to-Chrome import could hit the existing simultaneous-update guard without an explicit runner/operator conflict decision.

## Hardening Applied

The runner was hardened with:

- Bounded retry/polling for propagation-sensitive `verifyFolderVisible` steps.
- Fail-fast behavior after the first required failed step.
- Explicit Desktop import trigger steps after Chrome exports.
- Explicit `conflictDecision: "approve-merge"` for runner Desktop-to-Chrome import steps.

No delete, tombstone, restore, purge, raw SQL, chat deletion, snapshot deletion, or broad filesystem operation was added.

## Final Runner Proof

Command:

```bash
node tools/smoke/local-folder-sync-mutation-smoke-runner.mjs \
  --allow-mutation \
  --chrome-port 9247 \
  --timeout-ms 30000
```

Final result:

- `ok`: `true`
- `status`: `mutation-smoke-passed`
- `blockers`: `[]`
- Final folder matched on Chrome and Desktop.
- Final Chrome row count: `24`
- Final Desktop row count: `24`
- `chromeOnlyCount`: `0`
- `desktopOnlyCount`: `0`
- Deferred propagation warnings remained non-blocking.

## Safety Constraints Preserved

- Runner requires explicit `--allow-mutation`.
- Only create/rename/color/sync/visibility smoke ops are used.
- No delete or tombstone mutation is included.
- No restore behavior is included.
- No hard delete or purge path is used.
- No raw SQL path is used.
- No chat rows are deleted.
- No snapshot rows are deleted.
- No tombstone propagation apply path is used.
- Chrome remains the light companion surface.
- Desktop remains the canonical/professional workspace surface.

## Verdict

Slice 5B combined mutation smoke runner is green for local Chrome <-> Desktop folder create, rename, and color roundtrip. This closes the create/rename/color mutation smoke proof. Delete/tombstone, restore receipts, purge/retention, WebDAV/cloud/relay, and public release signing remain outside this slice.
