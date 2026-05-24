# Folder Color Sync P8h Closeout

Phase: P8h-e5
Status: Folder color sync proven; rename and delete remain protected

## Verdict

Folder color sync is proven across:

- Native ChatGPT with the H2O sidebar
- Chrome Studio
- Desktop Studio through reviewed manual mirror refresh

The canonical color source remains Native H2O folder-state. Chrome Studio can request a Native-owned color operation, and Desktop Studio can import the resulting canonical state through the reviewed Desktop mirror refresh flow.

## Completed commits and phases

The color-sync path was completed through these phases and commits:

| Phase | Commit | Result |
| --- | --- | --- |
| P8h-b | `5e3bdae` | Normalized canonical folder colors so Studio canonical rows use native `FolderParity` color fields. |
| P8h-count-label | `be42afb` | Clarified local Studio counts as `known here`. |
| P8h-c | `aa822fd` | Added menu parity UI with rename, delete, and color protected until authority was proven. |
| P8h-d1 | `eeafb09` | Documented the folder metadata authority model. |
| P8h-d2 | `64af7d4` | Documented the read-only operation preview model. |
| P8h-e1 | `d3808c9` | Added the Native folder metadata operation API. |
| Native regression fix | `81f3211` | Fixed initial Native folder UI regressions after the owner API. |
| Native menu/render fix | `61bce88` | Fixed Native folder action menu and folder page render. |
| P8h-e2a | `acf7f81` | Added Chrome Studio to Native request/response bridge plumbing. |
| Bridge timeout fix | `9c413c1` | Fixed Native owner timeout in the operation bridge. |
| Validation fix | `8362989` | Fixed Native preview validation for Studio-originated color requests. |
| Storage bridge fix | `7d36583` | Fixed request/result visibility across the Studio and Native storage bridge. |
| P8h-e2b | `af31178` | Enabled Chrome Studio canonical color requests through the Native owner. |
| Chrome popup fix | `65db66e` | Restored the Chrome Studio folder color popup after enabling canonical color requests. |
| Native popup fix | `0faccde` | Restored the Native folder row action popup. |
| Native/Chrome proof closeout | `8ac8760` | Documented the validated Native and Chrome color apply path. |
| Settings tabs | `023eb1a` | Reorganized Folder Parity Settings into tabs with operation status badges. |
| Settings color deltas | `526615f` | Added Desktop mirror refresh color-delta preview. |

## Final proven path

The final proven color path is:

```text
Chrome Studio color pick
-> Native owner preview
-> Native owner apply
-> Native H2O folder-state update
-> Native broadcast
-> Chrome FolderParity / DOM update
-> Desktop mirror refresh imports canonical folder-state
-> Desktop FolderParity / DOM update
```

Chrome Studio does not write canonical folder metadata directly. It sends a reviewed metadata operation request to the Native owner. The Native owner validates and applies the canonical color update to H2O folder-state.

Desktop Studio does not receive automatic Native in-page broadcasts today. Desktop parity is achieved by the reviewed mirror refresh path, which previews the incoming canonical folder-state, shows membership and color deltas, requires exact confirmation, and then refreshes only the Desktop mirror key.

## Proof result

The final color proof used Study as the canonical folder under test.

Observed result:

- Native Study color: `#F472B6`
- Chrome Study model and DOM color: `#F472B6`
- Desktop Study model and DOM color after reviewed mirror refresh: `#F472B6`

The old Chrome local appearance override remained present but was ignored for canonical rows.

## Safety boundaries

The following boundaries remain active:

- Canonical source remains `h2o:prm:cgx:fldrs:state:data:v1` / `H2O.folders`.
- Canonical color resolves as `iconColor || color`.
- Chrome canonical rows do not write `h2o:studio:sidebar:row-appearance:v1`.
- Chrome canonical rows do not write native folder-state directly.
- Desktop Studio does not write canonical metadata directly.
- Desktop Studio uses reviewed manual mirror refresh for canonical folder-state propagation.
- Desktop SQLite folder and binding tables are not canonical color authority.
- Rename remains disabled and protected.
- Delete remains disabled and protected.
- Local Review rows are not canonical mutation targets.
- No official ChatGPT folder metadata mutation API is proven.

## Remaining limitations

The color path is complete for the current safety model, but these limitations remain:

- Desktop propagation is a manual reviewed refresh, not automatic.
- Desktop auto relay is future work.
- Rename sync is not implemented.
- Delete sync is not implemented.
- Non-empty folder delete policy is not implemented.
- Official ChatGPT folder rename, delete, and color APIs remain unproven.

## Next recommended phase

The next folder parity phase should be:

```text
P8h-f - Rename sync planning
```

Rename should reuse the same authority rule: Native H2O folder-state is the canonical source, Studio surfaces request operations rather than writing metadata directly, and all apply paths need preview, stale-state protection, and clear blocked behavior for conflicts.
