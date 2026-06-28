# Saved Chat Archive Status Badge — E.2 Milestone Closure

Date: 2026-06-24

Status: E.2 CLOSED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/evidence-only closure note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes.

Predecessor runtime smoke:

```text
e199cf5 docs(studio): record archive status runtime smoke   (E.2.4)
```

## Closed E.2 Chain

| Subphase | Commit |
|---|---|
| E.2.0 contract | `5ae737c docs(studio): define archive delivery status contract` |
| E.2.1 status model/accessors | `bfb14b1 feat(studio): add archive delivery status model` |
| E.2.2 inline badge UI shell | `041dd69 feat(studio): render archive delivery status badge` |
| E.2.3 receipt read-back gesture | `2f812ad feat(studio): add archive status receipt check` |
| E.2.4 lifecycle fix (hydrate) | `7cb7706 fix(studio): hydrate archive status badge rows` |
| E.2.4 lifecycle fix (apply) | `2352d20 fix(studio): apply hydrated archive status badges` |
| E.2.4 lifecycle fix (keep) | `9b1f779 fix(studio): keep hydrated archive status badges attached` |
| E.2.4 lifecycle fix (preserve) | `69eb5b0 fix(studio): preserve archive status badges across thin rerenders` |
| E.2.4 lifecycle fix (construction) | `0140dcd fix(studio): render archive badges on construction rows` |
| E.2.4 runtime smoke | `e199cf5 docs(studio): record archive status runtime smoke` |

## What E.2 Now Proves

- Chrome Studio now has a quiet inline archive status badge surface for saved
  chat rows.
- The status model is pure and metadata-only (no DOM, no timers, no delivery, no
  Desktop calls).
- The badge renders in the saved-row UI using the focused helper and the existing
  one-line `renderRow` delegation from E.2.2.
- Badge rendering supports the real `renderRow` construction lifecycle, including
  detached construction articles (the final E.2.4 fix: identifier-only match so
  a detached construction article is a valid target, preventing retarget to an
  older connected row the list is about to replace).
- Saved + snapshot-backed rows render correctly.
- Linked saved rows remain supported (saved wins over `isLinked`).
- True link-only Add-to-Library rows do not show archived/saved archive status as
  if saved.
- Legacy delivered entries with no `requestId` remain passive (`archive-requested`,
  no gesture affordance).
- `requestId`-backed delivered entries render as interactive `waiting-for-desktop`
  badges with click/Enter/Space gesture affordance.
- Receipt read-back remains explicit user gesture only.
- No passive read-back happens during render.
- No duplicate delivery is triggered by the status UI.

## Final E.2.4 Runtime Pass

- Surface:
  `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html?h2oSmokeBridge=folder-sync-rc#/saved?folder=__none__`
- isChromeExtension: `true`
- folderConnected: `true`
- permission: granted
- storageKeysCount: 10
- rowCount: 28
- savedSnapshotBackedRows: 28
- deliveredLocalRows: 10
- rowsWithRequestId: 10
- articleCount: 21
- archiveBadgeCount: 10
- interactiveBadgeCount: 10
- archiveBadgeStates: `waiting-for-desktop: 10`
- badge diagnostics:
  - rendered: 10
  - connectedRendered: 10
  - staleArticleRetargeted: 0
  - hydrationAttempts: 21
  - hydrationResolved: 21
  - hydrationMisses: 0

## Final Interpretation

- `waiting-for-desktop` is correct because delivered entries had `requestId` but
  no Desktop receipt had been read yet.
- `interactiveBadgeCount: 10` is correct because `requestId`-backed rows can use
  the E.2.3 gesture.
- The absence of `archived` / `failed` / `needs-desktop-snapshot` states in this
  smoke is not a failure; those states require Desktop receipt processing and a
  user gesture.
- Earlier zero-badge runs were explained by either missing archive folder
  permission, empty delivered map, wrong route/surface, stale extension instance,
  or row lifecycle bugs that were fixed through the E.2.4 chain.

See `release-evidence/2026-06-24/saved-chat-archive-status-e2-runtime-smoke.md`.

## Locked Boundaries

- Chrome remains intent-only; Desktop remains authoritative.
- No app-wide floating overlay.
- No polling, no watcher, no MutationObserver, no background daemon.
- No passive receipt read-back.
- No passive delivery from badge rendering.
- No Chrome enqueue / materialize / package / CAS / SQLite writes from status UI.
- No Desktop runtime changes.
- No sync/WebDAV/cloud/native messaging/localhost relay.
- No `S0F0j` / `S0F1j` edits.
- No new monolith expansion beyond the existing focused one-line `studio.js`
  delegation from E.2.2.
- Badge read-back remains explicit click / Enter / Space only.

## Remaining Deferred Work

- Desktop scanner / receipt round-trip smoke: listener-delivered request →
  Desktop scanner receipt → user gesture reads receipt → badge flips to
  `archived` / `already-archived` / `needs-desktop-snapshot` / `failed`.
- Legacy delivered entries with `requestId: null` remain passive unless a future
  migration/back-fill maps them to a `requestId`.
- Optional first-run folder-connection onboarding.
- Product UX hardening for empty folder permission / folder disconnected state.
- Per-event cap / backlog-drain tuning.
- Retry / repair / overwrite / stale-writing policy remains deferred.
- Import / export / recovery remains deferred.
- Saved-package sync / WebDAV / cloud remains deferred.
- Archive Health mutation / repair UI remains deferred.

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

E.2 is CLOSED. Chrome Studio now renders a quiet inline archive status badge on
saved snapshot-backed rows, driven by a pure metadata-only status model,
debounced local-cache hydration, and an explicit gesture for receipt read-back —
Chrome intent-only, Desktop authoritative, no passive read-back, no monolith
edits, construction-row lifecycle correctly handled. The first end-to-end round-
trip (listener deliver → Desktop scanner → user gesture → badge flips to archived)
is the recommended next milestone.
