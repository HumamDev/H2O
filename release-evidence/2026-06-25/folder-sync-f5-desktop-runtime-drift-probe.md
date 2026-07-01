# Folder Sync - Phase F5: Desktop Runtime Drift Probe

Date: 2026-07-01

## Status

DISABLED / READ-ONLY RUNTIME PROBE PREPARED. No product runtime source was changed. No runtime hook was
installed. No reconciliation writes were implemented. No mirror write-through behavior was added. No
folder mutation behavior changed. No public/premium sync was enabled. No real remote WebDAV was
implemented. The closed Labels / Tags / Categories metadata lane was not modified by F5.

## Context

- Phase F4 runtime drift-probe design gate committed:
  `b21f408dc6e0fb4a9f5f2d8f2f3f3ea8f7b6c1d1`.
- Phase F3 read-only probe contract committed: `ba0a13f`.
- Phase F2 source-of-truth drift detector committed: `ef4fb16`.
- Folder sync remains NOT READY. Public/premium sync remains blocked. Real remote WebDAV remains
  deferred.

## Runtime Availability

A local Desktop binary process was visible (`target/debug/h2o-studio-desktop`), but this terminal
session did not provide a DevTools execution bridge into the Tauri WebView. Therefore F5 does not claim
that a live Desktop DevTools probe was executed in this environment. F5 instead provides the exact
disabled/read-only Desktop DevTools snippet and validates the probe contract with deterministic writer
traps and fixtures.

## Desktop Runtime Read APIs

The runtime probe reads only:

- canonical Desktop folder rows: `H2O.Studio.store.folders.getAll()`
- recently-deleted / tombstone view: `H2O.Studio.store.folders.listRecentlyDeletedFolders()`
- canonical chat-folder bindings: `H2O.Studio.store.folders.listCanonicalChatFolderBindings()`
- render mirror: read-only `FOLDER_STATE_DATA_KEY` (`h2o:prm:cgx:fldrs:state:data:v1`) through
  `chrome.storage.local.get` when available, with localStorage read fallback for dev surfaces.

No writer API is invoked.

## Manual Desktop DevTools Command

Print the exact snippet:

```bash
node tools/validation/sync/validate-folder-sync-f5-desktop-runtime-drift-probe.mjs --print-devtools-snippet
```

Run the printed snippet in Desktop Studio DevTools only, against a dev Desktop instance. Capture only
the JSON result. The required success properties are:

- `schema: "h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1"`
- `surface: "desktop-studio"`
- `mode: "manual-devtools-read-only"`
- `writeCallCount: 0`
- `readOnly: true`
- no raw folder names
- no raw chat titles/content
- no raw account/user/mobile/peer identifiers

## Drift Classes

The F5 probe emits the F3/F2 drift classes:

- `missing-mirror-folder`
- `extra-mirror-folder`
- `field-mismatch:name`
- `field-mismatch:color`
- `field-mismatch:sortOrder`
- `tombstone-status-mismatch`
- `binding-mismatch`
- `desktop-sqlite-source-diverged`
- `stale-deferred-propagation`

## Writer Traps

The F5 probe must prove:

- `writeCallCount: 0`
- no SQLite mutation
- no `chrome.storage.set`
- no folder `create` / `upsert` / `patch`
- no `bindChat` / `unbindChat`
- no tombstone mutation
- no binding mutation
- no mirror repair
- no export/write transport call
- no WebDAV write

Any non-zero writer count is a hard failure.

## Redaction

Diagnostics are hash-only:

- no raw folder names
- no raw chat titles/content
- no account/user data
- no raw mobile identifiers
- no raw peer/device identifiers
- folder/chat/binding/peer identities are emitted only as deterministic SHA-256 prefixes

## Cross-Surface Requirement

F5 preserves future compatibility across Desktop Studio, Chrome/native extension Studio across multiple
devices, and the mobile app. It does not assume a single Desktop-to-Chrome pair. It preserves
peer/device identity as redacted diagnostics, shared folder/item envelope compatibility,
Desktop-canonical default authority, and future mobile compatibility. F5 does not implement mobile
sync, remote transport, public/premium sync, or real WebDAV.

## Boundaries Preserved

- Folder sync remains NOT READY.
- Public/premium sync remains blocked.
- Real remote WebDAV remains deferred.
- Hard delete remains blocked.
- Folder delete remains soft/tombstone/recoverable.
- Folder delete preserves chats.
- The mirror is not made write-through.
- No reconciliation writes are implemented.
- Product sync remains globally NOT READY.

## Validator

Path:

- `tools/validation/sync/validate-folder-sync-f5-desktop-runtime-drift-probe.mjs`

The validator proves:

- this evidence exists and references F4 commit `b21f408dc6e0fb4a9f5f2d8f2f3f3ea8f7b6c1d1`;
- F5 is disabled/read-only;
- the Desktop DevTools snippet is present and printable;
- the probe compares Desktop SQLite folders against `FOLDER_STATE_DATA_KEY`;
- the F3/F2 drift classes are emitted or modeled;
- diagnostics are redacted/hash-only;
- `writeCallCount: 0`;
- no SQLite/chrome.storage/tombstone/binding/transport writes;
- folder sync stays NOT READY;
- public/premium sync stays blocked;
- real remote WebDAV stays deferred;
- future Desktop + Chrome/native extension multi-device + mobile compatibility is recorded;
- the Labels / Tags / Categories lane is not expanded or modified by F5.

## Verdict

Phase F5 verdict: PASS for a disabled/read-only Desktop runtime probe package and deterministic
contract proof.

Probe execution status: not live-executed in this environment because no Desktop DevTools execution
bridge was available from the terminal. The exact manual snippet is versioned through the validator.

Recommended F6 slice: run the F5 snippet in Desktop Studio DevTools, capture the redacted report, prove
`writeCallCount: 0` against live runtime state, and keep the result evidence-only unless a read-only
diagnostic hook is explicitly approved.
