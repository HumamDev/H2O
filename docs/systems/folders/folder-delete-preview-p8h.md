# Folder Delete P8h Closeout

Phase: P8h-g3 / P8h-g4
Status: Native delete safety proven; Chrome empty-folder delete through Native owner proven; Desktop delete apply remains disabled

## Verdict

P8h-g1, P8h-g2, P8h-g3, and P8h-g4 are complete under the current safety model.

The completed delete work proves:

- Native delete preview is available and read-only.
- Native empty-folder delete apply is available only with exact confirmation.
- Native create/delete lifecycle UX refreshes immediately.
- Native folder action popup is visible, body-fixed, and usable.
- Native folders page/list rows expose folder action affordances.
- Chrome Studio delete preview UI exists.
- Chrome Studio empty-folder delete apply works through the Native owner bridge.
- Chrome Studio does not use a local fallback delete/write path.
- Chrome Studio removes deleted Native-owned folders from FolderParity after the authoritative Native mirror merge.
- Non-empty folders remain blocked.
- Desktop Studio delete apply remains disabled.

## Relevant Commits

| Phase / fix | Commit | Result |
| --- | --- | --- |
| P8h-g1 Native delete preview | `5050019fcec99c7a74575da2c8f83ac9ecac6cd8` | Added read-only delete preview details and blockers. |
| P8h-g2 Native empty-folder delete apply | `74e8b980284c10e45de50b59fde34024da3f7264` | Enabled Native-owned empty-folder delete apply with exact confirmation. |
| P8h-g3 action popup parity and Chrome preview | `4b4e0831a70df8feab10c4c6f6f083b5b412ac51` | Added folder action popup parity and Chrome delete preview UI without Chrome apply. |
| Native popup root fix | `d11d315ada5c081ab61568a1b0c0d7b1be336f59` | Made Native folder action buttons create the H2O action menu reliably. |
| Native popup positioning | `dc662bfb9092c2f1a771caf460db4b29b377ff82` | Moved the Native popup to a body-fixed, unclipped placement path. |
| Native action button hitbox fix | `98e8912cf8b0ba6951754065c386b21640a74c62` | Fixed the Native action button geometry and real-click target. |
| Native popup layout/height fix | `2fcbc6f88810245a959ef9fc10ebe2bd014f1fce` | Fixed the collapsed popup layout so actions are visible and usable. |
| Native create/delete lifecycle UX fix | `3387e6f25915702f33baf7126f53f0fc146ae104` | Replaced browser delete prompt with an H2O modal and refreshed Native sidebar/page after create/delete. |
| Chrome native-backed folder creation | `71d8a7654bf4760643df2f3ab4dcc2d530a60bbd` | Added a Chrome Studio create-folder panel backed by the Native owner API. |
| Chrome create bridge diagnostics | `fcf0fb616337cef20d15670aa796cee2b081f9f6` | Added live request tracing for create-folder bridge diagnosis. |
| Chrome create apply flow | `82705969ac00a1f76292c3d443656ad1f097524e` | Fixed the Chrome create panel preview-to-apply transition. |
| Created folder action menu | `4a7daa639d79ec7e021508244afba3f66c652137` | Ensured newly created canonical folders can open the existing action menu. |
| Dynamic Native folders in FolderParity | `7ba546b6a07d80af7fcbb89ada9e30e2252e6fb5` | Included Native-created dynamic folders in Chrome Studio FolderParity. |
| Chrome delete mirror merge | `bd22356ddadeec48001b51ea6e0fd52b89c0976a` | Made incoming Native folder-state authoritative for deleted Native-owned rows. |

## Runtime Proof Results

Non-empty Study delete apply was blocked:

- `ok: false`
- `applied: false`
- `noMutation: true`
- `writesPerformed: 0`

Temporary empty folders `Delete Test` / `Delete Test 2` were deleted only after exact confirmation:

```text
DELETE EMPTY FOLDER
```

Final folder state is clean:

| Folder | Membership count |
| --- | ---: |
| Study | 4 |
| Case | 0 |
| Dev | 0 |
| Code | 1 |
| Tech | 2 |
| English | 1 |

No temporary delete-test folder remains.

Native popup proof:

- The Native popup is visible and body-fixed.
- The popup contains usable folder actions.
- The popup includes Color, Open folder, Open in Studio, Rename folder, Delete folder, and Copy folder ID.
- Native folders page/list rows have action affordances.

Chrome Studio empty-folder delete proof:

- Temporary folder `Delete Test Chrome` was created through Chrome Studio using the Native owner bridge.
- The temporary folder was empty and exposed the existing Chrome Studio action menu.
- Chrome Studio delete preview showed membership count `0` and required exact confirmation:

```text
DELETE EMPTY FOLDER
```

- Chrome Studio delete apply reached the Native owner and Native removed the folder.
- Native final state no longer contains `Delete Test Chrome`.
- Chrome Studio FolderParity final state no longer contains `Delete Test Chrome`.
- The All folders page no longer shows `Delete Test Chrome`.
- Chrome Studio FolderParity still contains `Study`.

Chrome mirror merge proof:

- Before the final mirror fix, Chrome had received the authoritative Native folder-state but merged it additively.
- The stale stored row for `Delete Test Chrome` had source `native-folder-catalog` and survived even though Native no longer listed it.
- The final merge rule treats incoming Native folder-state as authoritative for Native-owned rows.
- Stored Native-owned rows absent from incoming Native folder-state are removed from the Chrome mirror.
- Non-Native/local review/imported-style rows are preserved according to existing semantics.

Study non-empty safety proof:

- Study delete panel opens.
- Native members: `4`.
- Blockers include `delete-non-empty-folder-blocked` and `delete-confirmation-required`.
- Confirmation input is disabled.
- Delete cannot apply.

## Safety Boundaries

The following boundaries remain active:

- Native H2O folder-state remains the canonical folder metadata authority.
- Chrome delete apply is enabled only for empty canonical folders through the Native owner bridge.
- Chrome does not perform direct local fallback deletes.
- Desktop delete apply is not enabled.
- Desktop SQLite/Rust paths are not part of delete authority.
- Local Review rows are protected and are not delete targets.
- Non-empty folders remain blocked.
- Empty-folder delete requires exact confirmation.
- The browser `prompt()` / `confirm()` path for exact delete confirmation has been replaced with an H2O-owned modal.
- The delete flow does not delete chats.
- Desktop remains display-only and receives canonical changes later through reviewed mirror refresh.

## Remaining Work

The next phase should be:

```text
P8h-g5 - Desktop mirror delete propagation proof
```

P8h-g5 should keep the same safety model:

- Desktop receives canonical delete state only through reviewed mirror refresh.
- Desktop direct delete remains disabled.
- SQLite/Rust folder and binding stores remain non-authoritative for delete.
- Non-empty delete remains blocked.
- Local Review rows remain protected.
