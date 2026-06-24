# Internal/Local Sync RC Refresh After Phase 5A

## Verdict

The local folder sync RC remains green for internal/local testing after Phase 5A visible folder parity closure.

This checkpoint is not a public release approval. Public signing, notarization, public release audit, WebDAV/cloud/relay transport, purge/hard-delete policy, full chat-folder binding sync, and labels/tags/categories sync remain deferred.

Latest Phase 5A visual QA evidence:

- `cf7bce2fc256939ed5a1484417cebb99dbbc1841` - `docs(sync): record visible folder parity visual qa`

## Green Local RC Scope

The current internal/local sync RC is green for:

- folder create / rename / color local sync
- delete / restore / status-only receipts
- retention diagnostics with purge enforcement deferred
- Desktop Recently Deleted operator UI
- Desktop Folder Sync Health dashboard
- Chrome/Desktop normal visible folder list parity

## Phase 5A Chain

Chrome/Desktop visible folder parity was closed through:

- `177619b` - visible parity diagnostics
- `fe4268c` - store Desktop visible folder set
- `6d5a564` - hide Chrome stale folders by Desktop visible set
- `8bdd437` - filter Chrome hidden Desktop folders
- `bc7d1ff` - show Desktop visible folders in Chrome
- `4e0ec28` - close visible folder parity phase 5a4
- `4ddf2f2` - document Desktop queue timeout recovery
- `d2fb0d5` - align Desktop visible folder source
- `daa13b7` - close visible folder parity phase 5a
- `cf7bce2` - record visible folder parity visual QA

## Phase 5A Result

Final Phase 5A runtime and visual QA evidence recorded:

- `diagnoseCanonicalVisibleFolderSet ok:true`
- Desktop UI display count: `14`
- Chrome display count: `14`
- Chrome stored Desktop visible set count: `14`
- Desktop/Chrome diffs empty
- Chrome-only folders: `0`
- Desktop-only folders: `0`
- stale candidates: `0`
- `getFolderModel rowCount:14`
- `canonicalRowCount:14`
- stale `zz-4d4-delete-restore...` rows absent from Chrome normal list

Architecture confirmed:

- Desktop authoritative visible folder store is canonical.
- Desktop UI, Desktop `latest.json` visible export, Chrome stored Desktop visible set, and Chrome UI normal folder list use the same visible projection.
- Chrome remains a light companion and does not gain delete/restore authority.

## Safety Invariants

The refreshed RC scope preserves:

- no Chrome delete authority
- no Chrome restore authority
- no tombstone apply/create on Chrome
- no hard delete
- no purge
- no chat deletion
- no snapshot deletion
- no raw SQL delete path

## Caveats

Desktop smoke queue timeout:

- Desktop queue timeout can occur when the dev runtime, port, URL flag, localStorage opt-in, or queue polling state is not active.
- This is documented as a runtime/operator setup issue, not a product parity code issue.
- Recovery is documented in `4ddf2f2`.

Deferred / not public release scope:

- WebDAV/cloud/relay transport remains deferred.
- purge / hard delete remains deferred.
- chat-folder binding sync remains deferred.
- labels / tags / categories sync remains deferred.
- public release signing and notarization remain deferred.
- public release audit remains deferred.

## Evidence Inventory

Relevant evidence includes:

- `release-evidence/2026-06-24/internal-local-sync-rc-snapshot.md`
- `release-evidence/2026-06-24/sync-milestone-release-readiness-checkpoint.md`
- `release-evidence/2026-06-24/local-folder-sync-packaged-rc-smoke.md`
- `release-evidence/2026-06-24/folder-delete-restore-lifecycle-phase4c-4e-closeout.md`
- `release-evidence/2026-06-24/folder-delete-restore-lifecycle-phase4f-packaged-smoke.md`
- `release-evidence/2026-06-24/folder-delete-restore-recently-deleted-ui-polish-closeout.md`
- `release-evidence/2026-06-24/folder-delete-restore-recently-deleted-ui-placement-closeout.md`
- `release-evidence/2026-06-24/folder-sync-health-dashboard-polish-closeout.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a-closeout.md`
- `release-evidence/2026-06-24/folder-visible-parity-phase5a-manual-visual-qa.md`

## Recommendation

This checkpoint is ready for internal/local sync RC testing.

Recommended next choices:

1. Refresh packaged/internal artifact hash evidence if selecting a specific app bundle for handoff.
2. Continue manual visual QA if more operator screenshots or notes are needed.
3. Keep purge/hard-delete design separate.
4. Keep WebDAV/cloud/relay transport separate.
5. Keep signing/notarization and public release audit separate.
