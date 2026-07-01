# Folder Sync — Phase F9: productSyncReady Local Readiness Gate

Date: 2026-07-01

## Status

AUDIT / READINESS GATE ONLY. No new runtime behavior was implemented. No mirror repair was performed.
The mirror was not made write-through. `productSyncReady` was NOT flipped. No `fullBundle.v3` was
minted. No WebDAV/cloud/archive CAS was implemented. No Chat Saving / archive package code was touched.
No multi-writer, no catalog CRUD. No product source was modified. This gate decides whether local
folder sync is ready for a `productSyncReady` flip-gate review.

## Context

- F8 Chrome/Desktop folder parity proof committed: `0f03357` (status:
  `PASSED_CHROME_DESKTOP_FOLDER_PARITY`).
- F8 Desktop export parity committed: `7a88daf`; F8 export bug fix committed: `58a0993`
  (skip orphan folder export items).
- Chat Saving WebDAV/cloud/archive CAS remains blocked. Real remote WebDAV/cloud/relay remains blocked.
  Public/premium sync remains blocked.

## Cross-Surface Requirement (carried, not implemented in F9)

Future shared sync must support Desktop Studio, Chrome / native extension Studio across MULTIPLE
DEVICES, and the mobile app — preserving per-peer / per-device identity (hash-only), redacted
diagnostics, shared folder/item envelopes, and Desktop-canonical default authority. Mobile and remote
transport are NOT implemented in F9. Chrome / native extension and mobile remain non-canonical future
participants.

## 1. F1–F8 Folder Lane Summary

- F1 source-of-truth reconciliation: identified the split — SQLite `folders` canonical vs
  `FOLDER_STATE_DATA_KEY` render mirror; Chrome native-owner non-canonical.
- F2 validator-only drift detector: modeled SQLite-vs-mirror drift classes.
- F3 read-only live drift probe contract: fixture-backed, `writeCallCount: 0`.
- F4 runtime drift-probe design gate: disabled/read-only Desktop probe boundary + writer traps.
- F5 Desktop runtime drift probe: disabled/read-only implementation.
- F6 live Desktop runtime drift evidence: `writeCallCount: 0`, `diagnosticCount: 9`, redacted.
- F7 reconciliation decision matrix: classified the 4 drift classes (rebuild candidate / canonical
  review / blocked).
- F8 Chrome/Desktop folder parity proof: `PASSED_CHROME_DESKTOP_FOLDER_PARITY` after the export orphan
  bug fix.

## 2. What Is Now Proven

- Desktop SQLite canonical source (folders/bindings/tombstones).
- render mirror divergence detected (`FOLDER_STATE_DATA_KEY` vs SQLite).
- live Desktop drift captured (F6: `writeCallCount: 0`, `diagnosticCount: 9`).
- drift classes classified (F7 decision matrix).
- export orphan bug fixed (F8 `58a0993`: skip orphan folder export items).
- fresh Desktop export parity passed (F8 `7a88daf`).
- Chrome/Desktop folder parity passed (F8 `0f03357`): folder catalog baseline 6; Chrome visible 5;
  Desktop latest visible 5; folderState/display binding projection 12; folderParity comparable binding
  count 12; `desktopCanonicalChatFolderBindings` imported count 12; orphan/extra binding count 0;
  `productSyncReady: false`; no `fullBundle.v3`; no WebDAV/cloud/archive CAS; no Chrome canonical
  mutation; no destructive folder/chat behavior.

## 3. What Remains Unresolved

- mirror write-through/rebuild NOT implemented (F7 `missing-mirror-folder` / `field-mismatch:color`
  rebuild candidates are deferred; the mirror is not yet a strict derived projection of SQLite).
- binding-mismatch repair REMAINS BLOCKED (deferred to a dedicated reviewed binding-repair phase).
- `sortOrder` ownership still needs review (Desktop SQLite vs native-owner reorder).
- public/premium NOT ready.
- real remote WebDAV NOT ready.
- mobile / extension multi-device parity NOT implemented.

## 4. Readiness Decision

Folder sync is **NOT YET READY to flip `productSyncReady`**. F8 proves a strong POINT-IN-TIME
Chrome↔Desktop folder parity, but the reopened source-of-truth split is not structurally closed: the
render mirror is not yet a write-through projection, so divergence can RECUR (a single parity snapshot
is not sustained-parity-by-construction), and binding repair + `sortOrder` ownership remain open.

Therefore this local flip-gate review's verdict is NOT READY, and the recommended next phase is
**F10 = a design-only mirror write-through / rebuild specification** (per the F7 matrix) — not the flip
itself and not more live evidence, because the unmet prerequisites are exactly the F7 rebuild-candidate
/ blocked / review items. `productSyncReady` stays `false`.

## 5. Prerequisites Before `productSyncReady` Can Flip

All of the following must be satisfied first:

- mirror write-through/rebuild implemented so the mirror is a strict derived projection of canonical
  SQLite (`missing-mirror-folder` and `field-mismatch:color` reconciled by construction, not one-time).
- `binding-mismatch` repair unblocked via the reviewed `chat-folder-binding` loop, with sustained zero
  binding drift.
- `sortOrder` ownership decided (Desktop-canonical vs native-owner) and reconciled.
- sustained Desktop↔Chrome parity (re-run, drift auto-reconciled) — not a single snapshot.
- invariants preserved: no `fullBundle.v3`, no WebDAV/cloud/archive CAS, no Chrome canonical mutation,
  no destructive folder/chat behavior; hard delete blocked; folder delete preserves chats.
- a defined multi-device + mobile cross-surface path, so a local flip does not break future parity.
- explicit maintainer flip-gate approval.

## 6. Prerequisites Before Chat Saving WebDAV/Cloud/Archive CAS Can Restart

Chat Saving WebDAV/cloud/archive CAS RESTART remains BLOCKED until ALL of these are explicitly
satisfied:

- every §5 folder-flip prerequisite satisfied AND `productSyncReady` flipped `true` (local).
- real remote WebDAV / cloud / relay design + proof gates passed (still deferred).
- an archive CAS / `fullBundle.v3` design gate passed (currently no `fullBundle.v3`, no CAS).
- the identity / key / E2E boundary satisfied for remote/CAS.
- an explicit product decision and maintainer approval.

## 7. Chat Saving Restart Remains Blocked

Chat Saving WebDAV/cloud/archive CAS restart is BLOCKED. None of §6 is satisfied yet; no `fullBundle.v3`
and no CAS markers exist, and folder local readiness has not reached the flip. Do not restart Chat
Saving cloud/archive work in this lane.

## Verdicts

- Folder sync readiness: NOT READY (point-in-time parity proven; source-of-truth split not structurally
  closed).
- Local `productSyncReady` flip: NOT READY; `productSyncReady` stays `false`.
- Public/premium sync: REMAINS BLOCKED.
- Real remote WebDAV: deferred/blocked.
- Chat Saving WebDAV/cloud/archive CAS restart: REMAINS BLOCKED.
- Desktop remains canonical; Chrome remains read-only / non-canonical; Chrome / native extension and
  mobile stay non-canonical future cross-surface participants; hard delete blocked; folder delete
  preserves chats; no `fullBundle.v3`; no WebDAV/cloud/archive CAS. The closed Labels / Tags /
  Categories metadata lane is not modified by this folder-sync lane (its four core applied types —
  `chat-category-assign`, `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any
  label/tag Operational unbind extension is a separate out-of-scope lane).

## Recommended Next Phase

F10 = a design-only mirror write-through / rebuild specification (no writes, no flip): specify the safe
render-only mirror rebuild-from-SQLite for the F7 rebuild-candidate classes, the `sortOrder` ownership
review, and the deferred binding-repair; keep `productSyncReady` false and Chat Saving restart blocked.
