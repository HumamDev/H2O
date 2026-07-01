# Folder Sync — Phase F10: Mirror Write-Through / Rebuild Specification (design-only)

Date: 2026-07-01

## Status

DESIGN / SPECIFICATION ONLY. No runtime behavior was implemented. No mirror repair was performed. The
mirror was NOT made write-through. `productSyncReady` was NOT flipped. No `fullBundle.v3` was minted. No
WebDAV/cloud/archive CAS was implemented. No Chat Saving / archive package code was touched. No
multi-writer, no catalog CRUD. No folder mutation behavior changed. No product source was modified. This
slice specifies the safe mirror write-through / rebuild model BEFORE any implementation.

## Context

- F9 productSyncReady local readiness gate committed: `157d66a` (verdict: PASS, but productSyncReady is
  NOT READY TO FLIP).
- F8 Chrome/Desktop folder parity proof committed: `0f03357` (Desktop export parity passed; Chrome/Desktop
  folder parity passed; binding projection 12; comparable binding count 12; imported count 12; orphan/extra
  0; `productSyncReady: false`; no `fullBundle.v3`; no WebDAV/cloud/archive CAS; no Chat Saving package body
  markers).
- F7 reconciliation decision matrix classified the live drift: `missing-mirror-folder` = mirror rebuild
  candidate; `field-mismatch:color` = mirror rebuild candidate; `field-mismatch:sortOrder` = canonical
  review required; `binding-mismatch` = blocked until explicit write-through/repair phase.
- Folder sync remains NOT READY. Public/premium sync remains blocked. Real remote WebDAV remains deferred.
  Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Cross-Surface Requirement (carried, not implemented in F10)

Folder sync must be designed for future parity across Desktop Studio, Chrome / native extension Studio
across MULTIPLE DEVICES, and the mobile app. Do not assume a single Desktop↔Chrome pair. Preserve
per-peer / per-device identity (hash-only), redacted diagnostics, shared folder/item envelopes,
Desktop-canonical default authority, and future mobile compatibility. Mobile, remote WebDAV, and Chat
Saving CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical future
participants.

## 1. Safe Mirror Write-Through / Rebuild Model

- Desktop SQLite `folders` (+ bindings/tombstone tables) is CANONICAL for every folder field.
- `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`) is a DERIVED RENDER MIRROR ONLY — a
  projection of canonical SQLite, never an independent write target.
- Write-through rule (FUTURE, F11+): after a SUCCESSFUL SQLite write, the corresponding render fields are
  projected into the mirror (write-through). SQLite is written first and remains authoritative.
- Rebuild rule (FUTURE, F11+): on detected drift for an allowed class, the affected mirror render fields
  are rebuilt FROM SQLite (render-only, idempotent). The rebuild reads canonical SQLite and writes only
  the mirror; it never writes SQLite, bindings, tombstones, or transport.

## 2. Desktop SQLite Folders = Canonical

Desktop SQLite is the single canonical owner of folder name, color, `sortOrder`, deleted/tombstoned
state, and chat-folder bindings. Any write-through or rebuild follows SQLite; it never redefines
canonical state.

## 3. `FOLDER_STATE_DATA_KEY` = Derived Render Mirror Only

The mirror is a disposable projection used for rendering/export. It carries no authority. It can always
be rebuilt from canonical SQLite. It is never the source of truth and never mutated independently.

## 4. Allowed Future Rebuild Actions

Allowed LATER, after F10 approval (render-only, from Desktop SQLite):

- `missing-mirror-folder`: a folder exists in canonical SQLite but is absent from the mirror → project
  the canonical folder row INTO the mirror (additive; no chat/binding mutation). Idempotent.
- `field-mismatch:color`: the mirror render color differs from canonical SQLite color → overwrite the
  mirror render color with the canonical SQLite color (render-only field; no binding/chat effect).
  Idempotent.

Both are render-only projections of canonical SQLite; neither writes SQLite, bindings, tombstones, or
transport; neither can move or drop a chat.

## 5. Why `field-mismatch:sortOrder` Requires Canonical Ownership Review First

Ordering is the field most likely mutated by the native ChatGPT owner (users reorder in the native
surface). The F1 model treats SQLite as canonical for `sortOrder`, but a blind mirror rebuild could
overwrite a legitimate native-owner reorder. Therefore `sortOrder` rebuild is GATED on an explicit
canonical ownership decision (Desktop-canonical vs native-owner, and how a native reorder reconciles back
into SQLite) BEFORE any rebuild is allowed. It is NOT in the initial allowed rebuild set.

## 6. Why `binding-mismatch` Remains Blocked

Bindings determine chat placement; an incorrect rebuild could move or drop a chat. Binding drift may be a
legitimate in-flight native-owner change not yet absorbed, or a stale mirror. Binding repair must go
through a DEDICATED, REVIEWED binding-repair phase using the existing `chat-folder-binding` request loop
(Chrome→Desktop→Chrome), never an ad-hoc mirror rebuild. `binding-mismatch` stays BLOCKED.

## 7. Exact No-Write Boundary for F10

F10 writes NOTHING: no SQLite write, no `FOLDER_STATE_DATA_KEY` / `chrome.storage.set` write, no
tombstone write, no binding write, no mirror repair, no export/transport call, no productSyncReady flip,
no `fullBundle.v3`, no CAS. F10 is a specification.

## 8. Future F11 Implementation Entry Criteria

A Phase F11 write-through/rebuild implementation may proceed ONLY when ALL hold:

- this F10 spec is approved and committed.
- the write-through/rebuild is render-only (mirror only), idempotent, and limited to the two allowed
  classes (`missing-mirror-folder`, `field-mismatch:color`).
- `sortOrder` stays gated on the canonical ownership decision; `binding-mismatch` stays blocked.
- SQLite is never written by the rebuild; no chat is moved or dropped; no tombstone/restore/purge mutation.
- no `productSyncReady` flip; no `fullBundle.v3`; no WebDAV/cloud/archive CAS; no Chat Saving restart.
- the validator + live-proof requirements below are in place.

## 9. Validator Requirements Before Any Write-Through Implementation

- a write-through/rebuild unit validator: rebuild makes the mirror match the SQLite projection for the two
  allowed classes; idempotent (a second rebuild is a no-op); no SQLite/binding/tombstone/chat mutation.
- a no-canonical-mutation guard: the rebuild writes ONLY the mirror render fields; SQLite is unchanged.
- a drift-reconvergence validator: post-rebuild drift for the two rebuilt classes is `0`, while
  `binding-mismatch` and `sortOrder` are left untouched.
- a redaction guard: rebuild diagnostics stay hash/redacted only (no raw names/titles/content/identifiers).

## 10. Live Proof Requirements After Implementation

- a live Desktop rebuild proof (behind a disabled-by-default dev gate): rebuild `missing-mirror-folder`
  and `field-mismatch:color` from SQLite, re-run the F6-style drift probe → those classes clear; bindings
  and `sortOrder` unchanged; the write counter is limited to mirror-only writes; no chat is lost; output
  redacted.
- sustained parity (re-run) showing the rebuilt classes stay converged.

## 11. Rollback / Recovery Behavior

Because SQLite is authoritative and the mirror is a DERIVED / DISPOSABLE projection, rollback is safe: if
a rebuild produces unexpected drift, re-project the mirror FROM canonical SQLite again (SQLite is never
touched, so canonical state is intact and recoverable). A rebuild that would touch bindings, tombstones,
chats, or transport ABORTS before any write. No canonical data can be lost by a mirror rebuild.

## 12–17. Preserved Safety Invariants

- hard delete remains blocked.
- folder delete remains soft / tombstone / recoverable.
- chats are preserved on folder delete.
- Chrome / native extension and mobile remain NON-CANONICAL unless explicitly redesigned later.
- public/premium sync remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Classification of Proposed Future Actions

- Allowed later, after F10 approval:
  - rebuild missing mirror folder rows from Desktop SQLite (`missing-mirror-folder`).
  - rebuild mirror color from Desktop SQLite (`field-mismatch:color`).
- Requires ownership decision first:
  - `sortOrder` / order / sidebar position.
- Blocked:
  - binding repair (`binding-mismatch`).
  - tombstone/restore mutation.
  - folder delete/purge.
  - Chrome canonical mutation.
  - mobile canonical mutation.
  - remote WebDAV propagation.
  - `productSyncReady` flip.
  - Chat Saving CAS restart.

## Verdicts

- F10: PASS (design/spec only). The mirror write-through/rebuild model, the allowed render-only rebuild
  set, the `sortOrder` ownership gate, the `binding-mismatch` block, the no-write boundary, the F11 entry
  criteria, the validator + live-proof requirements, and the rollback model are specified. No writes, no
  flip, no CAS, no source change.
- Mirror write-through/rebuild decision: mirror stays a DERIVED render projection of canonical SQLite;
  future rebuild is render-only and limited to `missing-mirror-folder` + `field-mismatch:color`.
- `productSyncReady`: remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED.
- Real remote WebDAV: deferred. Public/premium: blocked. Desktop remains canonical; Chrome / native
  extension and mobile stay non-canonical future cross-surface participants; hard delete blocked; folder
  delete preserves chats. The closed Labels / Tags / Categories metadata lane is not modified by this
  folder-sync lane (its four core applied types — `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind extension is a separate
  out-of-scope lane).

## Recommended F11

F11 = implement the render-only mirror write-through/rebuild for the two allowed classes
(`missing-mirror-folder`, `field-mismatch:color`) behind a disabled-by-default dev gate, with the §9
validators and the §10 live proof, keeping SQLite canonical, `sortOrder` gated, `binding-mismatch`
blocked, `productSyncReady` false, and Chat Saving CAS blocked. If the `sortOrder` ownership decision is
not yet made, F11 covers only the two color/missing-folder classes.
