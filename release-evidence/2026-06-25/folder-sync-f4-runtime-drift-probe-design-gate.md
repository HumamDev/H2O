# Folder Sync — Phase F4: Runtime Drift-Probe Design Gate (disabled/read-only)

Date: 2026-07-01

## Status

DESIGN / AUDIT ONLY. No runtime probe was implemented. No DevTools snippet was run. No runtime hooks
were added. No product source was modified. No reconciliation writes were added. The mirror was not made
write-through. No public/premium sync was enabled. No real remote WebDAV was implemented. The closed
Labels / Tags / Categories metadata lane was not modified by this folder-sync lane. This slice specifies
the boundary for a later (F5) disabled/read-only Desktop DevTools runtime drift probe that will invoke
the F3 read-only drift contract against a LIVE Desktop Studio instance.

## Context

- Folder Sync Phase F3 read-only drift probe contract committed: `ba0a13f` (fixture-backed /
  contract-only; modeled SQLite canonical folders vs `FOLDER_STATE_DATA_KEY` mirror drift with
  `writeCallCount: 0`).
- Folder sync remains NOT READY. Public/premium sync remains blocked. Real remote WebDAV remains
  deferred. Hard delete remains blocked; folder delete preserves chats; Desktop remains canonical by
  default.

## Cross-Surface Requirement (carried, not implemented in F4)

Folder sync must be designed for future parity across Desktop Studio, Chrome / native extension Studio
across MULTIPLE DEVICES, and the mobile app. Do not assume a single Desktop↔Chrome pair. The runtime
probe and every later slice must preserve: per-peer / per-device identity (hash-only), redacted
diagnostics, shared folder/item envelopes, Desktop-canonical default authority, and future mobile
compatibility — WITHOUT implementing mobile or remote transport in F4. The first live probe (F5) is
Desktop Studio only; Chrome / native extension and mobile remain future cross-surface participants that
import Desktop-derived state read-only and never become canonical without explicit later design
approval.

## 1. Runtime Probe Boundary

- disabled by default / read-only.
- Desktop Studio only for the first live probe (F5).
- no writes to SQLite.
- no writes to chrome.storage / `FOLDER_STATE_DATA_KEY`.
- no tombstone writes.
- no binding writes.
- no mirror repair.
- no WebDAV writes.

The probe observes; it never mutates canonical SQLite, the render mirror, tombstones, bindings, or any
transport.

## 2. How the Live Probe Reads (read-only)

The probe reads, without mutating:

- Desktop canonical SQLite folder state (names, colors, `sortOrder`, tombstone/deleted flags) via the
  existing read APIs (`getAll` / `list` / `listCanonicalChatFolderBindings`).
- the `FOLDER_STATE_DATA_KEY` render mirror (`{ folders: [...], items: {...} }`) via a read-only
  `chromeStorageGet`.
- folder bindings (canonical binding APIs + mirror `items{}`).
- tombstones / recently-deleted state where safely readable
  (`listRecentlyDeletedFolders` / `getActiveFolderTombstone`), read-only.

## 3. Redacted Output Model

- hash-only folder IDs where needed (no raw folder identifiers beyond a hash).
- no raw folder names.
- no raw chat titles/content.
- no account / user / mobile / peer raw identifiers (peer/device identity is hash-only).
- emit ONLY the F3/F2-compatible drift classes:
  - `missing-mirror-folder`
  - `extra-mirror-folder`
  - `field-mismatch:name`
  - `field-mismatch:color`
  - `field-mismatch:sortOrder`
  - `tombstone-status-mismatch`
  - `binding-mismatch`
  - `desktop-sqlite-source-diverged`
  - `stale-deferred-propagation`

## 4. Writer Traps

The probe must prove it took no write path:

- `writeCallCount: 0`.
- no `create` / `upsert` / `patch`.
- no `bindChat` / `unbindChat`.
- no tombstone mutation (`softDeleteEmptyFolder` / `restoreTombstonedFolder` / purge).
- no `chrome.storage.set` (no `FOLDER_STATE_DATA_KEY` write).
- no export / write transport calls.

Every canonical/mirror writer is wrapped in a trap that increments a counter and throws in the probe;
the probe asserts the counter stayed `0`.

## 5. DevTools / Manual Runtime Proof Steps for Later F5 (design only — do not run in F4)

These are documented FUTURE EVIDENCE STEPS for F5; no snippet is run in F4:

- where to run: Desktop Studio DevTools console (Tauri webview), against a running dev Desktop instance
  only — never a user's production library.
- what to run: a read-only snippet that (a) reads the canonical folder set and the
  `FOLDER_STATE_DATA_KEY` mirror through the read adapters, (b) computes the F3 drift classes, (c)
  reports `writeCallCount` from the writer traps.
- what output to capture: the drift-class counts, `writeCallCount: 0`, the surface (`desktop-studio`),
  and hash-only folder ID digests — nothing raw.
- how to redact: run the output through the redaction rules in §3 before capture; assert no raw
  name/title/content/identifier appears.
- how to prove no writer path was called: the captured evidence must show `writeCallCount: 0` and the
  writer-trap assertions passing; any non-zero count is a hard failure.

## 6. Failure Modes

- Desktop app not running → probe reports `desktop-not-running`; no fallback write; F5 defers.
- unavailable SQLite bridge → `sqlite-bridge-unavailable`; read-only, no write; report and defer.
- unavailable mirror key → `mirror-key-unavailable`; treat as `missing-mirror-*` drift, no write.
- malformed mirror state → `mirror-state-malformed`; report as drift/diagnostic, never repair in the
  probe.
- permission / runtime API missing → `runtime-api-unavailable`; abort read-only, no write.
- dirty working tree caveats → the probe evidence must note any dirty-tree state (e.g. the unrelated
  label/tag Operational WIP) that could affect reproduction; the probe itself reads runtime state, not
  the working tree.

## 7. Reconfirmations

- folder sync remains NOT READY.
- public/premium sync remains blocked.
- real remote WebDAV remains deferred.
- hard delete remains blocked.
- folder delete preserves chats.
- Desktop remains canonical by default.
- Chrome / native extension and mobile remain future cross-surface participants (non-canonical, read-only
  import), not implemented in F4.

## 8. Recommended F5 Slice

Recommend **F5 = a disabled/read-only Desktop runtime probe implementation/proof**: implement the
read-only probe behind a disabled-by-default dev gate, run it against a live dev Desktop Studio
instance, emit the F3 drift classes with redacted/hash-only output, and prove `writeCallCount: 0` via
the writer traps. Do NOT implement reconciliation writes, make the mirror write-through, enable
public/premium sync, or implement real remote WebDAV in F5. If a live Desktop instance is not available,
F5 defers with the failure-mode reporting in §6.

## Verdicts

- Folder sync readiness: NOT READY.
- Real remote WebDAV: deferred.
- Public/premium sync: REMAINS BLOCKED until folder local readiness AND remote transport readiness pass.
- No product source was modified in F4; no reconciliation writes; the mirror is not write-through.
- Desktop remains canonical authority; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants; hard delete blocked; folder delete preserves chats. The closed Labels /
  Tags / Categories metadata lane is not expanded or modified by this folder-sync lane (its four core
  applied types — `chat-category-assign`, `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` —
  remain; any label/tag Operational extension is a separate out-of-scope lane).
