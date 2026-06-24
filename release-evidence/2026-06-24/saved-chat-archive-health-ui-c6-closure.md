# Saved Chat Archive Health UI - C6 Milestone Closure

Date: 2026-06-24

Status: C6 CURRENT UI MILESTONE CLOSED

Lane: Chat Saving Architecture (Phase C). This is a docs/evidence-only closure
note. It adds no runtime code, no validators, and no UI/sync/Chrome/import work.
It formally closes the current C6 Saved Chat Archive Health UI milestone after
C6.4 runtime evidence.

## Closed C6 chain

| Slice | Scope | Commit |
|---|---|---|
| C6.1 | Archive Health panel shell | `17b7918 feat(studio): add archive health panel shell` |
| C6.2 | Archive Health summary counts + Copy report JSON | `63a887e feat(studio): add archive health summary counts` |
| C6 mount fix | Mount Archive Health in the active Settings Diagnostics route | `1a5fefb fix(studio): mount archive health diagnostics card` |
| C6.2 evidence | Archive Health UI runtime smoke (PASSED) | `2ca7c26 docs(studio): record archive health ui runtime smoke` |
| C6.3 | Read-only package details UI | `f544582 feat(studio): add archive health package details` |
| C6.4 evidence | Package details UI runtime smoke (PASSED) | `5a496a0 docs(studio): record archive health details ui runtime smoke` |

## What is now proven

The Desktop Settings -> Diagnostics surface now includes the Saved Chat Archive
Health card as a read-only operator dashboard over the C5 diagnostics layer.

The current C6 milestone proves:

- Settings -> Diagnostics includes Saved Chat Archive Health.
- The Archive Health card mounts correctly in the active Settings route.
- Manual Run diagnostics works.
- Status states work: `idle`, `loading`, `unavailable`, `empty`, `ready`,
  `error`.
- Summary sections render:
  - Archive health
  - Integrity
  - Drift / informational warnings
  - DB checks
- Copy report JSON exists and succeeds or fails gracefully.
- Package details section is collapsed by default.
- Show / Hide package details toggle works.
- Details list uses the existing diagnostics result only; no extra diagnostics
  calls are required.
- Package details are sorted by severity: blocked, warning, ok.
- Details list caps visible rows at 50 and shows `Showing N of M packages`.
- Package paths are visible and selectable.
- Schema/status/chat/snapshot/blocker/warning/DB/asset summaries render.
- No repair/import/delete/open/restore/rebuild/sync/mutation actions are
  visible.

## Runtime evidence referenced

- C6.2 UI runtime smoke passed: `2ca7c26`.

  ```text
  [c6.2-archive-health-ui-smoke] ALL PASS
  ```

- C6.4 details UI runtime smoke passed: `5a496a0`.

  ```text
  [c6.4-archive-health-details-ui-smoke] ALL PASS
  ```

Important runtime observations:

- Route check passed for:
  - `#/settings/diagnostics`
  - `#/settings/diagnostics/storage`
- `#/settings/diagnostics/folder-parity` may intentionally omit the Archive
  Health card because Folder Parity owns that route.
- Runtime archive status was `ok`.
- Runtime package counts:
  - `packagesTotal: 13`
  - `packagesOk: 13`
  - `packagesWarning: 0`
  - `packagesBlocked: 0`
- Runtime DB checks:
  - `passed: 13`
  - `warnings: 0`
  - `failed: 0`

## Architectural conclusions

- C6 is a read-only Desktop operator surface over C5 diagnostics.
- C6 does not create a new source of truth.
- C6 does not mutate packages, DB, CAS, sync, or Chrome.
- C6 keeps package corruption separate from DB/CAS drift.
- Blockers mean package integrity problems.
- Warnings mean drift/informational mismatch unless package integrity is
  actually broken.
- The Archive Health UI is now safe enough as a Desktop diagnostic dashboard
  foundation.

## Explicitly not added

- No repair.
- No import/recovery.
- No delete.
- No overwrite.
- No package open/restore/rebuild action.
- No sync action.
- No Chrome UI.
- No user-folder export/save dialog.
- No CAS write-back.
- No DB writes.
- No package mutation.
- No C5.4B/C5.5 full DB-centric missing-package inventory.

## Explicitly deferred

- C5.4B/C5.5 full DB snapshot inventory.
- `missing-package-for-db-snapshot` scan.
- controlled drift-case UI smoke.
- repair/import/recovery.
- Phase D Chrome handoff.
- Phase E import/export compatibility.
- Phase F sync integration.
- user-folder export/save dialog.
- CAS GC/refcount repair.

## Closure verdict

Saved Chat Archive Health UI
C6.1: Closed
C6.2: Closed
C6 mount fix: Closed
C6.3: Closed
C6.4 evidence: Closed
C6 current UI milestone: CLOSED
