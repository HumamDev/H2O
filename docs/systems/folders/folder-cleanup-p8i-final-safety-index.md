# P8i Folder Cleanup Safety Index

Phase: P8i-final - folder cleanup safety index
Status: Docs-only closeout; cleanup remains preview-only

## Verdict

P8i completed the folder cleanup review, dry-run, and apply-preview safety stack without adding real cleanup apply.

The current system can identify review candidates, explain risks, generate a dry-run plan, and generate a preview-only apply gate. It cannot delete, remove, merge, repair, normalize, execute, or apply cleanup.

Strong warning:

```text
Real cleanup apply must require a new explicit approval gate and must not be bundled into the current P8i work.
```

## Relevant Commits

| Commit | Summary |
| --- | --- |
| `08d775fead483a691a33a2163cf7557eb2182a9b` | Document P8i live folder cleanup candidates |
| `ba45d198e919b0ef70af7f569712935560785120` | Document P8i reviewed folder cleanup plan |
| `a4ece22e69be677c8045bf1c2eb9ada569c04384` | Add read-only folder cleanup review panel |
| `430c35a594d9f56c9954b64cd40b5cb419201cc1` | Align folder parity sidebar and All folders views |
| `71c5fbb4bb5a952cba9a1e5136aaaeb3e96edb60` | Add dry-run folder cleanup plan |
| `a87b65cac3c56cb8bdef4774903d0e7e9e5451c1` | Document P8i dry-run cleanup proof |
| `0ead6410079fc068326badf8609f484ff59244d8` | Document P8i destructive cleanup gate |
| `e680877a88ab4de05e40f69a0021b4dd03a230a0` | Organize Folder Parity cleanup review into section tabs |
| `79130b132062228d1d2c6ae5bc8923594de165ce` | Document P8i apply preview proof |

## What P8i Completed

P8i completed:

- Live cleanup candidate capture for Chrome Studio and Desktop Studio diagnostics.
- A reviewed cleanup plan that defines candidate classes and safety gates.
- A read-only Folder Cleanup Review panel in Studio.
- Sidebar and All folders view alignment so canonical and Local Review rows are separated.
- Dry-run cleanup plan generation.
- Preview-only apply gate generation.
- Third-level section tabs so long cleanup review sections are discoverable without scrolling.
- Runtime proof that dry-run and preview-only flows do not mutate FolderParity state.

## Current UI Stack

The current cleanup UI stack is:

| Layer | Status |
| --- | --- |
| Live candidate report | Complete and documented |
| Reviewed cleanup plan | Complete and documented |
| Read-only cleanup review panel | Implemented |
| Third-level section tabs | Implemented |
| Dry-run plan generation | Implemented and runtime-proven |
| Preview-only apply gate | Implemented and runtime-proven |

The Cleanup / Review panel supports:

- Overview
- Candidates
- Dry-run Plan
- Preview Gate
- Conflicts
- Desktop
- Orphans

The broader Folder Parity page also keeps its main tabs:

- Overview
- Canonical Folders
- Local Review
- Mirror Refresh
- Cleanup / Review
- Operations / Proofs

## Current Folder Model State

Runtime proof for the P8i stack confirmed the model remained unchanged after refresh, dry-run generation, and apply-preview generation.

| Model area | Count |
| --- | ---: |
| Canonical rows | 6 |
| Review rows | 6 |

Canonical rows:

- Case
- Code
- Dev
- English
- Study
- Tech

Review rows:

- Case
- English
- Case-RT
- Empty Test Folder
- Empty-RT
- English-RT

## Safety Boundaries

P8i does not implement real cleanup apply.

Explicitly absent:

- cleanup apply
- cleanup delete
- cleanup remove
- cleanup merge
- cleanup repair
- cleanup normalize
- cleanup execute

P8i also does not add:

- Native state mutation
- Chrome storage mutation for cleanup
- Desktop mirror mutation for cleanup
- Desktop SQLite cleanup path
- Rust cleanup path
- F5/F6/F7 lifecycle changes
- tombstone cleanup changes

The Preview Gate is intentionally non-destructive:

```text
schema: h2o.folder-cleanup-apply-preview.v1
noMutation: true
applyAllowed: false
requiredConfirmationText: PREVIEW ONLY - NO CLEANUP
```

## Current Allowed Actions

The current cleanup UI may only perform read-only or local UI/reporting actions:

- refresh diagnostics
- select candidates
- generate dry-run plan
- copy dry-run JSON
- generate apply preview
- copy apply preview JSON

These actions must not write folder state, Native state, Chrome storage, Desktop mirror data, Desktop SQLite, Rust state, F5/F6/F7 state, or tombstones.

## Current Forbidden Actions

The current P8i stack forbids:

- actual apply
- actual delete/remove
- merge by name
- cleanup based on test-looking names
- cleanup with stale diagnostics
- cleanup with bindings
- cleanup with known counts
- cleanup with orphan risk treated as permission
- cleanup of Native-owned canonical rows from Chrome or Desktop
- Desktop SQLite cleanup
- cross-surface cleanup without explicit target surface
- automatic cleanup on boot, refresh, diagnostics, or mirror refresh

## Required Future Gate

Any real cleanup apply must be a separate phase with explicit approval.

Minimum future requirements:

- exact target surface
- exact target store
- exact folder ID confirmation
- fresh diagnostics
- dry-run plan hash/checksum match
- per-row blockers
- backup/export before mutation
- audit receipt
- explicit no-go rules for Native canonical rows, bindings, known counts, and orphan risk

## Recommended Next Decision

Recommended conservative decision:

```text
Stop here and keep cleanup preview-only.
```

Alternative only after explicit approval:

```text
Start a separate P8j or P8i-e2 design phase for real reviewed apply.
```

That phase should begin with docs/design, not mutation code. It should restate the destructive-action gate and prove the intended target store before implementation.
