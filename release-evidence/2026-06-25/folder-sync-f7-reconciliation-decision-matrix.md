# Folder Sync — Phase F7: Reconciliation Decision Matrix (read-only)

Date: 2026-07-01

## Status

DESIGN / AUDIT / READ-ONLY DECISION MATRIX ONLY. No reconciliation writes were implemented. No mirror
repair was performed. The mirror was not made write-through. No folder mutation behavior changed. No
runtime behavior changed. No product source was modified. No public/premium sync was enabled. No real
remote WebDAV was implemented. The closed Labels / Tags / Categories metadata lane was not modified.
This slice analyzes the F6 live Desktop drift diagnostics and publishes a reconciliation decision
matrix BEFORE any repair/write-through implementation.

## Context

- Folder Sync Phase F6 live Desktop runtime drift evidence committed:
  `deed147e76b61dfd496365e2a551194beb2a8bd2`.
- F6 proved live Desktop DevTools evidence: `writeCallCount: 0`, `diagnosticCount: 9`, all safety flags
  true, diagnostics hash/redacted only.
- F6 drift classes found (4 distinct classes across 9 diagnostics): `binding-mismatch`,
  `field-mismatch:color`, `field-mismatch:sortOrder`, `missing-mirror-folder`.
- Folder sync remains NOT READY. Public/premium sync remains blocked. Real remote WebDAV remains
  deferred.

## Cross-Surface Requirement (carried, not implemented in F7)

Folder sync must stay compatible across Desktop Studio, Chrome / native extension Studio across
MULTIPLE DEVICES, and the mobile app. Do not assume a single Desktop↔Chrome pair. Preserve per-peer /
per-device identity (hash-only), redacted diagnostics, shared folder/item envelopes, Desktop-canonical
default authority, and future mobile compatibility. Mobile and remote transport are NOT implemented in
F7. Chrome / native extension and mobile remain non-canonical future participants that import
Desktop-derived state read-only.

## Source-of-Truth Model (from F1 / F2 / F6)

- Desktop SQLite `folders` (+ bindings/tombstone tables) is CANONICAL for every folder field.
- `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`) is the chrome.storage RENDER MIRROR (a
  derived projection).
- Chrome / native owner is NON-CANONICAL; its mutations reconcile INTO Desktop via the H2O request
  loops (delete/restore/binding); they never make Chrome/mobile canonical.

## Reconciliation Decision Matrix

Each drift class is classified into exactly one of: EXPECTED BENIGN DRIFT / MIRROR REBUILD CANDIDATE /
CANONICAL REVIEW REQUIRED / BLOCKED UNTIL EXPLICIT WRITE-THROUGH/REPAIR PHASE.

| Drift class | Meaning under the model | Classification | Safe future handling |
| --- | --- | --- | --- |
| `missing-mirror-folder` | a folder exists in canonical SQLite but is absent from the render mirror | MIRROR REBUILD CANDIDATE | rebuild the mirror row FROM SQLite (additive/non-destructive; render-only) — deferred to the write-through/repair phase |
| `field-mismatch:color` | mirror folder color differs from canonical SQLite color | MIRROR REBUILD CANDIDATE | rebuild the mirror color FROM SQLite canonical (render-only, non-destructive) — deferred to the write-through/repair phase |
| `field-mismatch:sortOrder` | mirror folder order differs from canonical SQLite `sortOrder` | CANONICAL REVIEW REQUIRED | confirm ordering authority (Desktop SQLite vs native-owner reordering) BEFORE any rebuild; never blindly overwrite user ordering |
| `binding-mismatch` | mirror chat-folder bindings (`items{}`) differ from canonical SQLite bindings | BLOCKED UNTIL EXPLICIT WRITE-THROUGH/REPAIR PHASE | never auto-rebuild bindings; reconcile only through the existing `chat-folder-binding` request loop in a dedicated, reviewed repair phase; a chat must never be lost |

Category note: EXPECTED BENIGN DRIFT applies to `stale-deferred-propagation` (the `syncPropagation:
'deferred'` markers are expected and self-clear on propagation). F6 did not surface that class among
its 9 diagnostics, so it is defined here but not assigned to any observed F6 class.

## What Each Class Means (per the model)

- `missing-mirror-folder`: the render mirror is behind canonical SQLite; the canonical folder simply
  needs to be projected into the mirror. Lowest risk (additive render projection).
- `field-mismatch:color`: a canonical color edit did not project into the mirror; the mirror is a
  derived view, so it should follow SQLite. Low risk (render field).
- `field-mismatch:sortOrder`: ordering is the field most likely mutated by the native owner (users
  reorder in ChatGPT). The F1 model treats SQLite as canonical for `sortOrder`, but F7 requires an
  explicit ownership decision before rebuild, to avoid overwriting a legitimate native reorder.
- `binding-mismatch`: bindings determine chat placement; a wrong rebuild could move or drop a chat.
  Binding drift may be a legitimate in-flight native-owner change not yet absorbed, or a stale mirror.
  It must go through the reviewed binding loop, never an ad-hoc mirror rebuild.

## Safe Future Handling (definitions)

- READ-ONLY OBSERVE: keep emitting the drift diagnostics (as F5/F6) with `writeCallCount: 0`.
- REBUILD MIRROR FROM SQLITE: project canonical SQLite into the mirror (render-only, additive) — allowed
  only for MIRROR REBUILD CANDIDATE classes, and only in a later specified write-through/repair phase.
- REQUIRE CANONICAL REVIEW: decide the authoritative owner before any write (for `field-mismatch:sortOrder`).
- BLOCK REPAIR: no repair for `binding-mismatch` until a dedicated, reviewed write-through/repair phase.

## Hard Safety Constraints

- no hard delete.
- folder delete preserves chats.
- tombstones remain recoverable.
- no Chrome canonical mutation.
- no mobile / extension canonical mutation.
- Desktop remains canonical by default.

## What F8 Should Be

Recommend **F8 = a design-only write-through / rebuild specification** (no writes): specify the safe
mirror-rebuild-from-SQLite for the two MIRROR REBUILD CANDIDATE classes (`missing-mirror-folder`,
`field-mismatch:color`) as a render-only, additive, write-through-after-SQLite projection; specify the
CANONICAL REVIEW process for `field-mismatch:sortOrder`; and keep `binding-mismatch` BLOCKED pending a
dedicated reviewed binding-repair phase. F8 remains design-only — no reconciliation writes, no
write-through mirror implementation, no public/premium, no real remote WebDAV. Additional live evidence
or deferral are acceptable alternatives if the ownership review for `sortOrder` is not yet resolved.

## Verdicts

- Folder sync readiness: NOT READY.
- Public/premium sync: REMAINS BLOCKED until folder local readiness AND remote transport readiness pass.
- Real remote WebDAV: deferred.
- No repair or write-through was implemented; no product source was modified; the mirror is not
  write-through.
- Desktop SQLite remains canonical; `FOLDER_STATE_DATA_KEY` remains the render mirror; Chrome / native
  extension and mobile stay non-canonical future cross-surface participants; hard delete blocked; folder
  delete preserves chats. The closed Labels / Tags / Categories metadata lane is not modified by this
  folder-sync lane (its four core applied types — `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind extension is a separate
  out-of-scope lane).
