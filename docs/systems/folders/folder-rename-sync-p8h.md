# Folder Rename Sync P8h Closeout

Phase: P8h-f3
Status: Native and Chrome folder rename sync proven; Desktop propagation proven through reviewed mirror refresh

## Verdict

Native to Chrome folder rename sync is proven.

Chrome Studio can rename a canonical folder through the Native-owned metadata operation path. The Native H2O folder-state updates, Chrome merges the canonical folder metadata, and Chrome FolderParity plus the sidebar DOM show the renamed folder.

## Completed path

The completed rename path is:

```text
Chrome Studio Rename panel
-> Native owner preview/apply
-> Native H2O folder-state update
-> Native broadcast / Chrome merge
-> Chrome FolderParity and DOM update
```

Chrome Studio does not write canonical folder metadata directly. It builds a `rename-folder` metadata operation and sends it through the Native owner bridge. The Native owner validates the request, applies the canonical name change to H2O folder-state, and broadcasts the updated folder metadata back for Chrome to merge and render.

## Proofs completed

The rename proof covered:

- Native rename operation API worked.
- Direct Chrome to Native rename bridge worked.
- Chrome Rename panel worked after timeout, refresh, name-merge, and stale-state fixes.
- Rename `Study -> Study Temp` / `Study rrr` changed Native and Chrome.
- Rename back to `Study` succeeded.
- Same-name conflict attempt `Study -> Case` was blocked and did not change the folder.
- Final Chrome proof: `Study | #F472B6 | 4`.

The final proof confirms the canonical row name, color, and membership count stayed coherent after rename and revert.

## Safety boundaries

The following boundaries remain active:

- Folder ID is preserved.
- Membership count is preserved.
- Color and `iconColor` are preserved.
- Folder sort/order is preserved by the rename operation.
- Delete remains disabled and protected.
- Local Review rows are not rename targets.
- Chrome Studio does not write local fallback folder metadata for canonical rename.
- Desktop direct rename remains disabled.
- Desktop receives canonical rename later through reviewed mirror refresh.
- Official ChatGPT folder rename API remains unproven; the authority is H2O Native folder-state.

## Relevant commits

| Phase / fix | Commit | Result |
| --- | --- | --- |
| P8h-f1 Native rename operation API | `6359412cc98d6b145ce5245825b7ea01dfbdb24e` | Enabled Native-owned `rename-folder` preview/apply while preserving folder ID, membership, color, icon, and order. |
| P8h-f2 Chrome rename UI | `e504ddfb3b110ea1c0931905457dc73157bb6249` | Added Chrome Studio canonical Rename panel through the Native owner bridge. |
| Chrome refresh after Native rename | `fffefdb4af31705faba74b08de773e108ca0aae9` | Made Chrome refresh wait for native folder-state merge before rerendering. |
| Canonical name merge fix | `8369ef7842846bcba6058becd40da3f939289856` | Let stored canonical mirror names update fallback FolderParity rows by folder ID. |
| Rename panel timeout fix | `5701eab5feb09b8fe3c4c3f3af45d993b88dc085` | Kept the rename panel request path polling Native result visibility during preview/apply. |
| Rename panel stale-state fix | `83a8676801aa67272daf435266eb9ec9a7123f0c` | Resolved the current canonical row by folder ID when opening/submitting the rename panel. |

## Remaining work

## Desktop mirror propagation proof

Desktop receives canonical rename state through the reviewed Desktop mirror refresh path, not through direct Desktop metadata writes.

The proven Desktop path is:

```text
Native H2O folder-state JSON
-> Desktop Settings / Folder Parity / Mirror Refresh
-> reviewed preview and exact confirmation
-> Desktop mirror key refresh
-> Desktop FolderParity and DOM reflect the canonical folder name
```

Final Native state after the rename/revert proof:

- Study name: `Study`
- Study `iconColor`: `#F472B6`
- Study item count: `4`

Final Desktop state after reviewed mirror refresh:

- Surface: `desktop-studio`
- Model name: `Study`
- Model color: `#F472B6`
- Native membership count: `4`
- DOM text includes `Study`

This confirms Desktop can reflect the canonical final rename state after mirror refresh. The temporary `Study Temp` intermediate Desktop proof was not separately captured, so the proof is final-state propagation rather than a separately recorded before/after Desktop temporary-name transition.

## Remaining work

The rename path is complete for Native, Chrome, and Desktop under the current safety model. Remaining folder metadata parity work is:

- P8h-f4b - Show visible name deltas in Desktop Mirror Refresh preview.
- P8h-g - Delete sync planning and implementation.
- Optional future automatic Desktop propagation, if the reviewed manual mirror refresh is not enough.

Desktop remains display-only for rename. Desktop does not write canonical rename metadata directly, and Desktop SQLite folders and bindings are not canonical metadata authority. Delete remains a separate policy-heavy phase and must keep its preview and confirmation requirements.

The next UI improvement should make name deltas visible in the Mirror Refresh preview, for example:

```text
Study name: Study -> Study Temp
```
