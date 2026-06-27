# Saved Chat Archive Delivery on Save — E.1 Milestone Closure

Date: 2026-06-24

Status: E.1 CLOSED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/evidence-only closure note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes.

## Closed E.1 Chain

| Subphase | Commit |
|---|---|
| E.1.0 contract | `c8237d35 docs(studio): define saved chat archive save action contract` |
| E.1.0a trigger amendment | `9db61844 docs(studio): amend saved chat archive save action trigger` |
| E.1.1 listener implementation | `6c5e20c feat(studio): add archive delivery listener for saved rows` |
| E.1.1 saved-wins bug fix | `087282c fix(studio): allow linked saved rows in archive delivery listener` |
| E.1.2 static evidence | `c5df016 docs(studio): record archive delivery listener evidence` |
| E.1.3 runtime smoke evidence | `8aae9ec docs(studio): record archive delivery listener runtime smoke` |

## What E.1 Now Proves

- The main Chrome archive delivery trigger is no longer a manual proof button.
- It is a flag-gated listener on real Chrome library index updates.
- It uses the corrected trigger `evt:h2o:library-index:updated` and tolerates
  `evt:h2o:library:cross-surface-sync`.
- It reads `H2O.LibraryIndex.getAll()` because event details are summary-only.
- It selects saved + snapshot-backed rows.
- It excludes true link-only Add-to-Library rows.
- It does not exclude saved snapshot-backed rows merely because `isLinked` is
  true.
- It dedupes persistently by `chatId|snapshotId`.
- It delivers one metadata-only archive request per eligible saved
  snapshot-backed row.
- It is capped per event.
- It is best-effort and does not block library rendering.

## Runtime Smoke Result

- the flag `archive.deliverOnSaveToFolder` was enabled during the smoke only.
- helper APIs were available.
- the delivery API was available.
- the listener was installed.
- the folder `H2O Studio Archive Requests` was connected.
- permission was granted.
- File System Access was available.
- `savedSnapshotBacked`: 28
- `deliveredKeysCount`: 28
- `undeliveredSavedSnapshotBacked`: 0
- `linkedSavedRows`: 3
- `linkedSavedUndelivered`: `[]`
- a repeated manual index event produced `lastDelivered: 0` because all eligible
  rows were already deduped.
- persistent `chatId|snapshotId` dedupe held across reload / dispatch.

See `release-evidence/2026-06-24/saved-chat-archive-on-save-e1-runtime-smoke.md`.

## The Bug And The Fix

- The E.1.3 pre-fix probe showed 3 valid saved snapshot-backed rows were
  undelivered.
- All 3 had `isSaved: true`, `isLinked: true`, `displayView: "saved"`,
  `badgeKind: "Saved"`, and a present `snapshotId`.
- Root cause: over-broad link-only detection treated any `isLinked: true` row as
  link-only.
- Fix `087282c` made saved win over linked: true link-only rows are excluded,
  but saved snapshot-backed rows that are also linked are eligible.

## Locked Boundaries

- The feature flag default remains OFF.
- Chrome remains intent-only; Desktop remains authoritative.
- No `S0F0j` edit.
- No `S0F1j` edit.
- No Add-to-Library-only delivery.
- No transcript / messages / html / assets / `contentHash` / package content.
- No Chrome `enqueueSavedChatArchiveRequestV1` call.
- No Chrome `materializeSavedChatArchiveRequestV1` call.
- No package writer call.
- No CAS / store / SQLite writes from Chrome.
- No Desktop runtime changes.
- No capabilities changes.
- No sync/WebDAV/cloud.
- No native messaging.
- No localhost relay.
- No polling / watcher / background daemon.
- No app-wide floating buttons or overlays.

## Remaining Deferred Work

- Inline product status surface for archive delivery results.
- Optional first-run folder-connection onboarding.
- Product UX hardening for status / errors.
- Per-event cap tuning / backlog-drain behavior.
- Optional Desktop scanner confirmation for listener-delivered requests.
- Retry / repair / overwrite / stale-`writing` policy remains deferred.
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

E.1 is CLOSED. The main Chrome archive delivery trigger is now a flag-gated
(default OFF), event-driven listener that reads `H2O.LibraryIndex.getAll()` on
real library-index updates, selects saved snapshot-backed rows (saved wins over
linked), excludes true link-only and missing-snapshot rows, dedupes persistently
by `chatId|snapshotId`, and delivers one metadata-only request per eligible row
through the proven D.3C delivery API — Chrome intent-only, Desktop authoritative,
with the byte-locked monoliths untouched. Proven end-to-end on a real Chrome
setup (E.1.3) after the saved-wins fix.
