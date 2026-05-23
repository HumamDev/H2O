# Studio Folder Parity P8 Final Proof

Status: passed

Date: 2026-05-24

## Executive Verdict

P8 passed. Native ChatGPT, Chrome Studio, and Desktop Studio now present the same canonical folder catalog for the main folder UI:

- Study
- Case
- Dev
- Code
- Tech
- English

Local-only, duplicate, test, and review-required folder rows are quarantined outside the main canonical list under Local Review. The final runtime proof confirmed the previously stale Desktop Study membership count now matches Native and Chrome after reload.

## What P8 Fixed

P8 established canonical native folder display authority across Studio surfaces:

- `FolderParity.getDisplayModel()` now exposes canonical/local partitions through `canonicalRows` and `localReviewRows`.
- Chrome Studio renderers were migrated to the canonical/local partition.
- Desktop Studio renderers were migrated to the canonical/local partition.
- Desktop assignment dropdowns were constrained to canonical folders.
- Local Review was refined as a read-only quarantine for non-canonical rows.
- Canonical color/order fallback behavior was hardened so fallback rows can inherit stored canonical visual fields when native broadcast data is unavailable.
- A reviewed Desktop folder mirror refresh flow was added for stale Desktop canonical membership buckets.

The P8g fix addressed the narrow final mismatch where Desktop showed Study with 3 native memberships while Native and Chrome showed 4. After the reviewed Desktop mirror refresh and reload, Desktop also shows Study with 4.

## Final Parity Table

| Surface | Canonical folder order | Study native count | Local Review separation | Main-list leakage |
| --- | --- | ---: | --- | --- |
| Native ChatGPT | Study, Case, Dev, Code, Tech, English | 4 | Native catalog only | none observed |
| Chrome Studio | Study, Case, Dev, Code, Tech, English | 4 | separated | none observed |
| Desktop Studio | Study, Case, Dev, Code, Tech, English | 4 | separated | none observed |

## Runtime Proof Evidence

Final runtime proof confirmed:

- Native Study count: 4
- Chrome Studio Study count: 4
- Desktop Studio Study count: 4
- Desktop after reload still shows Study count: 4
- Desktop canonical names remain:
  - Study
  - Case
  - Dev
  - Code
  - Tech
  - English
- Chrome and Desktop main folder lists are clean.
- Local Review is separated from the canonical list.
- No bad canonical rows were found.
- No cleanup controls appear in normal folder UI.

## Safety Notes

The P8 final fix did not mutate native ChatGPT folder-state and did not modify Chrome storage. The Desktop refresh path writes only the Desktop mirror key:

```text
h2o:prm:cgx:fldrs:state:data:v1
```

During P8g-fix, Desktop SQLite `folders` and `folder_bindings` were not mutated. No cleanup, delete, merge, repair, or broad sync behavior was added to the normal folder UI.

## Non-Blocking Follow-Up

Track separately:

```text
P8g-followup — audit/storage visibility check for Desktop mirror refresh
```

Reason: Desktop `FolderParity` shows Study 4 and the reload proof confirms persistence at the model/UI level, but simple probes for these keys returned `null`:

- `platform.storage.get("h2o:prm:cgx:fldrs:state:data:v1")`
- `localStorage.getItem("h2o:prm:cgx:fldrs:state:data:v1")`
- `h2o:studio:folder-mirror-refresh-audit:v1`

This does not block visual/model parity because Desktop retained Study 4 after reload.

## Next Recommended Work

Close P8. Return next to the F5/tombstone/sync plan, keeping folder cleanup, Desktop SQLite mutation, and native folder-state mutation behind explicit reviewed phases.
