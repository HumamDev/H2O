# Folder Sync - Phase F3: Read-Only Live Drift Probe Contract

Date: 2026-07-01

## Status

READ-ONLY / DIAGNOSTIC ONLY. No product runtime source was changed. No folder reconciliation writes were
implemented. No mirror write-through behavior was added. No folder mutation behavior changed. No
public/premium sync was enabled. No real remote WebDAV was implemented. The closed Labels / Tags /
Categories metadata lane was not modified by this slice.

## Context

- Phase F2 source-of-truth drift detector committed: `ef4fb16`.
- F2 added a deterministic validator-only drift model for Desktop SQLite canonical folders vs the
  `FOLDER_STATE_DATA_KEY` render mirror.
- Folder sync readiness remains NOT READY.
- Public/premium sync remains blocked.
- Real remote WebDAV remains deferred until local folder readiness improves.

## Probe Mode

F3 is a **fixture-backed read-only probe contract**, not a product runtime hook. The validator models
the live probe with explicit read adapters and writer traps:

- canonical Desktop reads:
  - `H2O.Studio.store.folders.getAll()`
  - `H2O.Studio.store.folders.listRecentlyDeletedFolders()`
  - `H2O.Studio.store.folders.listCanonicalChatFolderBindings()`
- render mirror read:
  - `chromeStorageGet(FOLDER_STATE_DATA_KEY)`
- forbidden writes:
  - SQLite mutations such as `create`, `upsert`, `patch`, `softDeleteEmptyFolder`,
    `restoreTombstonedFolder`, `bindChat`, `unbindChat`, and `moveCanonicalChatFolderBinding`
  - chrome.storage mutations such as `chromeStorageSet`
  - tombstone writes
  - binding writes
  - mirror repair or reconciliation writes

The validator can be reused as the contract for a future live Desktop DevTools probe. In the current
repo-only environment, it does not attach to a running Desktop Studio instance and does not open a live
SQLite database. That limitation is intentional for F3: it proves the read-only probe shape and drift
report semantics before any runtime exposure.

## Safest Read Paths Discovered

Source inspection found these existing read paths:

- Desktop canonical folder rows: `listFolders(opts)` and public alias `getAll()` in
  `src-surfaces-base/studio/store/folders.tauri.js`.
- Recently deleted / tombstone view: `listRecentlyDeletedFolders(opts)` /
  `diagnoseRecentlyDeletedFolders`.
- Canonical chat-folder bindings: `listCanonicalChatFolderBindings()`,
  `getCanonicalChatFolderBindingForChat(chatId)`, and
  `listCanonicalChatFolderBindingsForChat(chatId)`.
- Render mirror: `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`) read via
  `chromeStorageGet(FOLDER_STATE_DATA_KEY)`.
- Existing runtime bridge precedent: `src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js`
  already performs read-only folder diagnostics through the same canonical and mirror readers.

## F2-Compatible Drift Classes Emitted

The F3 probe emits the F2 drift classes:

- `missing-mirror-folder`
- `extra-mirror-folder`
- `field-mismatch:name`
- `field-mismatch:color`
- `field-mismatch:sortOrder`
- `tombstone-status-mismatch`
- `binding-mismatch`
- `desktop-sqlite-source-diverged`
- `stale-deferred-propagation`

## Redaction Rules

Probe diagnostics are hash-only:

- no raw folder names;
- no raw chat titles;
- no raw chat content;
- no account or user data;
- no raw mobile, peer, or device identifiers;
- folder/chat/binding/peer identities are emitted only as deterministic SHA-256 prefixes.

The validator intentionally uses synthetic private folder names, chat ids, and peer/device ids in
fixtures, then asserts the emitted report does not contain those raw values.

## Cross-Surface Requirement

F3 preserves the future **Desktop Studio + Chrome/native extension multi-device + mobile-app parity**
target without implementing it:

- Desktop Studio remains the default canonical folder authority.
- Chrome/native extension Studio remains non-canonical and imports Desktop-derived state read-only by
  default.
- Multiple Chrome extension devices and the mobile app are future peers that must be represented by
  redacted peer/device identity in diagnostics and future envelopes.
- F3 does not implement mobile sync, multi-device transport, real remote WebDAV, or public/premium
  enablement.

## Boundaries Preserved

- No SQLite mutation.
- No chrome.storage mutation.
- No mirror repair.
- No tombstone write.
- No binding write.
- No hard delete.
- Folder delete remains soft/tombstone/recoverable.
- Folder delete preserves chats.
- Folder sync remains NOT READY.
- Public/premium sync remains blocked.
- Real remote WebDAV remains deferred.
- Product sync remains globally NOT READY.

## Validator

Path:

- `tools/validation/sync/validate-folder-sync-f3-read-only-live-drift-probe.mjs`

The validator proves:

- this evidence exists and references F2 commit `ef4fb16`;
- the probe is read-only / diagnostic-only;
- the contract compares Desktop SQLite folder reads against `FOLDER_STATE_DATA_KEY`;
- the probe emits the F2 drift classes;
- diagnostics are redacted/hash-only;
- no write adapter is invoked;
- no reconciliation write is modeled;
- source anchors for the canonical readers and mirror reader exist;
- future Desktop + Chrome/native extension multi-device + mobile-app parity is recognized as a
  requirement, not implemented;
- folder sync stays NOT READY, public/premium sync stays blocked, and real remote WebDAV stays
  deferred;
- the Labels / Tags / Categories lane is not modified by F3.

## Verdict

Phase F3 verdict: PASS for a fixture-backed read-only live drift probe contract.

Probe mode: fixture-backed / contract-only in this environment. A real Desktop Studio DevTools run is
still required before using the report operationally against live user data.

Recommended F4 slice: add a disabled/read-only Desktop DevTools runtime snippet or dev bridge command
that invokes the F3 probe against a live Desktop Studio instance, records only hash/redacted output,
and proves no writer path was called.
