# Saved Chat Archive Status Badge — E.2.4 Runtime Smoke

Date: 2026-06-24

Status: E.2.4 EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/evidence-only note recording a real Chrome extension Studio runtime pass. It
adds no runtime code, no validators, and no Chrome/Desktop/capability changes.

## Context

E.2.4 badge rendering went through several DOM-lifecycle fixes before the final
pass:

```text
7cb7706 fix(studio): hydrate archive status badge rows
2352d20 fix(studio): apply hydrated archive status badges
9b1f779 fix(studio): keep hydrated archive status badges attached
69eb5b0 fix(studio): preserve archive status badges across thin rerenders
0140dcd fix(studio): render archive badges on construction rows
```

The final fix `0140dcd` made detached renderRow() construction-row articles valid
badge targets (identifier-only match), so the helper stops retargeting to an
older connected row the list is about to replace.

## Final Runtime Result (real Chrome extension Studio)

- Surface:
  `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/saved?folder=__none__`
- isChromeExtension: `true`
- folderConnected: `true`
- permission: granted
- beforeLastDelivered: 5
- afterLastDelivered: 5
- afterLastReason: `library-index:updated`
- storageKeysCount: 10
- rowCount: 28
- savedSnapshotBackedRows: 28
- deliveredLocalRows: 10
- rowsWithRequestId: 10
- articleCount: 21
- archiveBadgeCount: 10
- interactiveBadgeCount: 10
- archiveBadgeStates: `waiting-for-desktop: 10`

## Badge Diagnostics

- calls: 21
- hydrationAttempts: 21
- hydrationResolved: 21
- hydrationMisses: 0
- rendered: 10
- connectedRendered: 10
- staleArticleRetargeted: 0
- fullRowCacheWrites: 21
- removed: 0
- lastState: `ready`
- lastReason: `eligible-not-delivered`
- lastError: (empty)

## Sample Badge Behavior

- text: `Waiting for Desktop`
- state: `waiting-for-desktop`
- interactive: `true`
- title: `Waiting for Desktop — delivered-no-receipt Click or press Enter to check archive status.`

## Interpretation

- The archive request delivery folder was connected and granted.
- The controlled E.1 listener seed created/confirmed local delivered metadata.
- The E.2.1 local delivery metadata accessor saw 10 delivered rows.
- E.2.2 / E.2.4 badge rendering produced 10 real DOM badges on saved rows.
- The E.2.3 gesture affordance became available because these delivered entries
  include a `requestId`.
- `waiting-for-desktop` is the correct state because no Desktop receipt had been
  read/processed yet.
- `interactiveBadgeCount: 10` is expected for `requestId`-backed rows.
- `staleArticleRetargeted: 0` confirms the final lifecycle fix: badges are written
  into the construction-row articles, not retargeted to replaced old rows.
- `rendered: 10` / `connectedRendered: 10` now match `archiveBadgeCount: 10` —
  diagnostics and final DOM agree (the earlier divergence is resolved).
- Do not interpret this as passive receipt read-back; the receipt check remains
  user-gesture-only.

## Prior Failure Path And Resolution

- Before folder reconnection, the active storage had `storageKeysCount: 0` and
  `deliveredLocalRows: 0`, so rows were correctly `ready` and no badges rendered
  (quiet default — correct behavior).
- After folder reconnection and a controlled delivery seed, delivered local
  metadata existed and badges rendered.
- The earlier lifecycle bug produced `rendered` diagnostics with no final DOM
  badges (the helper rendered into an older connected article that the list then
  replaced). The final fix `0140dcd` made construction-row articles valid render
  targets, avoiding retargeting to replaced old rows, so the badges now survive
  into the attached rows.

## Boundary Proof

- No app-wide floating overlay.
- No polling.
- No watcher.
- No MutationObserver.
- No passive receipt read-back.
- No passive delivery from badge render.
- No Chrome enqueue / materialize / package / CAS / SQLite writes from the status UI.
- No Desktop runtime changes.
- No sync/WebDAV/cloud/native messaging/localhost relay.
- No `S0F0j` / `S0F1j` edits.
- `studio.js` integration stayed as the existing focused one-line delegation from
  E.2.2.
- Badge read-back remains explicit click / Enter / Space only.

## Validation

```text
git diff --check
git diff --cached --check
```

Results:

- `git diff --check`: clean.
- `git diff --cached --check`: clean.

No docs/markdown lint/check script exists in `package.json` (confirmed); none was
run.

## Outcome

E.2.4 runtime smoke: EXECUTED - PASSED. With the delivery folder connected and a
controlled delivery seed, the inline archive status badge renders 10 real DOM
badges on saved snapshot-backed rows (all `waiting-for-desktop`), each interactive
because the delivered entries carry a `requestId`; diagnostics (`rendered: 10`,
`connectedRendered: 10`, `staleArticleRetargeted: 0`) agree with the final DOM
(`archiveBadgeCount: 10`). The construction-row rendering defect is resolved, and
all quiet-default / gesture-only / Chrome-intent-only / Desktop-authoritative
boundaries hold. E.2.5 closure remains the only open E.2 subphase.
