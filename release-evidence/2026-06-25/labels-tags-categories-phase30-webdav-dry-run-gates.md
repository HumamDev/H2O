# Labels / Tags / Categories / Classification Metadata Sync

## Phase 30 WebDAV Gate D/C++ — Dry-Run Gates

Date: 2026-06-30

## Status

Phase 30 is a dev-flagged, proof-only WebDAV enabling-control slice. No WebDAV upload/download was
implemented. No WebDAV writes are enabled. No remote files are written. No product sync semantics
changed. Local sync-folder JSON remains the active transport. Product metadata sync remains globally
NOT READY.

This phase adds disabled-by-default WebDAV control-plane guard evaluation and a redacted dry-run
manifest builder. The module is deterministic and proof-only: it reports whether a future
write-capable WebDAV path would be blocked or dry-run eligible, but it never performs the write.

## Context

- Phase 29 Gate C proof bridge committed: `9a89c57`.
- Phase 28 Gate B schema/guard spec committed: `3654291`.
- Phase 27 selected WebDAV as the recommended design candidate.
- Current proven applied request types remain exactly:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`
- WebDAV remains deferred in source (`webdav: 'deferred'`).
- Current working transport remains local sync-folder JSON: `latest.json` and `chrome-latest.json`.

## Files Changed

- `src-surfaces-base/studio/sync/webdav-transport-gates.js`
  - New shared dry-run gate module.
  - Installs `H2O.Studio.sync.webdavTransportGates`.
  - Exposes:
    - `buildDryRunManifest(input)`
    - `evaluateGuards(input)`
    - `dryRun(input)`
    - `diagnose()`
- `src-surfaces-base/studio/studio.html`
  - Loads `sync/webdav-transport-gates.js` after the existing local peer transport.
- `tools/product/studio/pack-studio.mjs`
  - Packages `sync/webdav-transport-gates.js` with the Studio surface.
- `tools/validation/sync/validate-labels-tags-categories-phase30-webdav-dry-run-gates.mjs`
  - Adds deterministic validator coverage for dry-run behavior only.
- `release-evidence/2026-06-25/labels-tags-categories-phase30-webdav-dry-run-gates.md`
  - This evidence file.

## Control-Plane Manifest

Dry-run schema:

`h2o.studio.sync.webdav-transport-control-plane.v1`

The manifest is metadata-about-transport only. It carries no request, receipt, projection, chat,
label, tag, category, account, or credential payload. It includes hash/redacted fields only:

- `transportKind`
- `schemaVersion` / `version`
- `remoteRootRef`
- `safePeerDirectory`
- `peerIdentity`
- `sequenceNumber`
- `previousExportId`
- `contentHash`
- `fileHash`
- `lastKnownRemoteState`
- `conflictStatus`
- `writeStatus`
- `readStatus`
- `recoveryStatus`
- `privacyRedactionStatus`

The dry-run result also reports:

- `activeTransport: 'local-sync-folder-json'`
- `localSyncFolderJsonActive: true`
- `remoteFilesWritten: false`
- `webdavWritesEnabled: false`
- `productSyncReady: false`

## Guard Matrix

The Phase 30 module evaluates the Phase 29/28 guard matrix:

- `feature-gate-guard`
- `dev-only-write-flag-guard`
- `envelope-unchanged-guard`
- `allowlist-unchanged-guard`
- `authority-model-guard`
- `chrome-read-only-guard`
- `desktop-canonical-guard`
- `no-destructive-action-guard`
- `no-schema-mutation-guard`
- `no-secret-raw-data-evidence-guard`
- `checksum-integrity-guard`
- `sequence-monotonicity-guard`
- `peer-identity-guard`
- `stale-basis-guard`
- `corrupt-partial-file-recovery-guard`
- `product-sync-ready-false-guard`

Default behavior is blocked safe:

- WebDAV is disabled by default.
- Write-capable WebDAV paths require the explicit dev-only flag
  `webdav-dev-only-do-not-ship`.
- Without that flag, write status is `skipped-no-dev-flag` or `disabled`.
- Even with that flag, Phase 30 returns `dry-run-dev-flag-present-no-remote-write`; it still performs
  no remote write.

## What Did Not Change

- No WebDAV upload implementation.
- No WebDAV download implementation.
- No WebDAV remote write.
- No remote file creation.
- No endpoints, credentials, tokens, or secrets added.
- No WebDAV default enablement.
- No UI.
- No transport writes.
- No metadata request/receipt/projection envelope schema mutation.
- No applied metadata request type change.
- No Chrome canonical mutation.
- No Desktop canonical authority change.
- No destructive action.
- No WebDAV/cloud/relay product transport enablement.

## Privacy / Redaction

The dry-run module only accepts and emits hash/redacted control-plane values for remote roots, peer
identity, peer directory, content hash, and file hash. If raw private values are provided to the
dry-run input, the manifest sets:

- `privacyRedactionStatus.rawInputRejected: true`
- guard blocker: `webdav-private-input-rejected`

Evidence and diagnostics intentionally contain no raw endpoint, credential, chat title, chat content,
label name, tag name, category name, or account-linked metadata.

## Same Envelopes Only

Phase 30 does not change the existing envelope set:

- `latest.json`
- `chrome-latest.json`
- `libraryMetadataMutationReceipts[]`
- `desktopCanonicalLibraryMetadata`

The dry-run gate module names those envelopes but never rewrites, serializes, uploads, downloads, or
imports them.

## Authority and Safety

- Desktop remains canonical authority.
- Chrome remains request-only and read-only over canonical metadata.
- WebDAV remains dumb transport only.
- Local sync-folder JSON remains the active transport.
- `productSyncReady` remains `false`.
- Applied request type allowlist remains exactly:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`

Safety flags remain:

- no hard delete
- no purge
- no chat delete
- no snapshot delete
- no asset delete
- no label delete
- no tag delete
- no category delete
- no metadata delete

## Validator / Proof Output

Validator:

`tools/validation/sync/validate-labels-tags-categories-phase30-webdav-dry-run-gates.mjs`

The validator proves:

- Phase 30 evidence exists and references Phase 29 commit `9a89c57`.
- The dry-run module is loaded by `studio.html` and packaged by `pack-studio.mjs`.
- The module contains no remote or persistence IO tokens such as fetch, WebDAV verbs, Chrome storage,
  local storage, or Tauri file write calls.
- The source applied allowlist remains exactly four request types.
- `webdav: 'deferred'` remains present in Desktop and Chrome sync diagnostics source.
- Default dry-run is blocked because WebDAV is disabled by default.
- Write-capable dry-run with no dev-only flag is blocked as `skipped-no-dev-flag`.
- Write-capable dry-run with the dev-only flag is still `dry-run-dev-flag-present-no-remote-write`.
- The manifest is redacted/hash-only and reports no remote writes.
- Product metadata sync remains globally NOT READY.

## Phase 30 Verdict

PASS for disabled-by-default WebDAV dry-run gates. The repo now has deterministic control-plane
manifest and guard validation for a future WebDAV proof path, without enabling transport writes or
changing product sync semantics.

WebDAV writes remain disabled. Local sync-folder JSON remains active. Product metadata sync remains
globally NOT READY.

## Recommended Phase 31

Phase 31 should be the first actual dev-only local WebDAV sandbox proof, if approved. It should:

- keep WebDAV disabled by default;
- require `webdav-dev-only-do-not-ship`;
- use a local/sandbox WebDAV endpoint with external local config only;
- write only to the sandbox endpoint;
- carry the same `latest.json` / `chrome-latest.json` envelopes byte-unchanged;
- capture redacted manifest and guard evidence;
- prove local fallback when gates fail;
- keep the applied allowlist at exactly four;
- keep product metadata sync globally NOT READY.
