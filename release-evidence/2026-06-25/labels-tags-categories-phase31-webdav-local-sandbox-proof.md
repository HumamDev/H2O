# Labels / Tags / Categories / Classification Metadata Sync

## Phase 31 WebDAV Local Sandbox Proof

Date: 2026-06-30

## Status

Phase 31 is a dev-only local WebDAV sandbox proof. It does not enable product WebDAV transport, does
not use a real remote WebDAV account, does not perform real remote writes, and does not change product
sync semantics. The proof uses a temporary local filesystem sandbox from the Phase 31 validator only.

Phase 30 WebDAV dry-run gates committed: `05814b6`.

## Scope

This phase validates the Phase 30 gate API with a local/temp sandbox proof:

- WebDAV remains disabled by default.
- Sandbox behavior requires the explicit dev-only flag `webdav-dev-only-do-not-ship`.
- Without that flag, sandbox behavior is blocked.
- With that flag, only validator-owned local sandbox behavior is allowed.
- No product WebDAV transport was enabled.
- No real remote writes were performed.
- No external endpoint, credential, token, or account config is used.
- Local sync-folder JSON remains the active product transport.
- Product metadata sync remains globally NOT READY.

## Files Changed

- `release-evidence/2026-06-25/labels-tags-categories-phase31-webdav-local-sandbox-proof.md`
  - This evidence file.
- `tools/validation/sync/validate-labels-tags-categories-phase31-webdav-local-sandbox-proof.mjs`
  - New validator/proof harness.
  - Executes `src-surfaces-base/studio/sync/webdav-transport-gates.js` in a VM.
  - Creates a temporary local sandbox under the OS temp directory.
  - Writes proof copies of `latest.json`, `chrome-latest.json`, and a redacted control-plane manifest
    only after the explicit dev flag path is proven.
  - Removes the temporary sandbox after proof execution.

No product source file changed in Phase 31.

## Proof Steps

The Phase 31 validator proves:

1. Phase 30 `H2O.Studio.sync.webdavTransportGates` installs and reports:
   - disabled-by-default WebDAV gates
   - active transport: `local-sync-folder-json`
   - `remoteFilesWritten: false`
   - `webdavWritesEnabled: false`
   - `productSyncReady: false`
2. Default WebDAV behavior is blocked:
   - `writeStatus: disabled`
   - blocker includes `webdav-disabled`
   - no sandbox files are written
3. Write-capable sandbox behavior without the dev flag is blocked:
   - `writeStatus: skipped-no-dev-flag`
   - blocker includes `webdav-dev-flag-required`
   - no sandbox files are written
4. With `webdav-dev-only-do-not-ship`, the guard permits only sandbox proof behavior:
   - `writeStatus: dry-run-dev-flag-present-no-remote-write`
   - WebDAV product writes remain disabled
   - remote files outside the sandbox remain unwritten
5. The sandbox proof writes only local/temp proof files:
   - `latest.json`
   - `chrome-latest.json`
   - `control-plane-manifest.json`
6. `latest.json` and `chrome-latest.json` are carried byte-unchanged in the sandbox proof.
7. The control-plane manifest is redacted/hash-only.
8. Local fallback remains active on guard failure.
9. The applied request type allowlist remains exactly:
   - `chat-category-assign`
   - `chat-category-clear`
   - `chat-label-bind`
   - `chat-tag-bind`
10. Metadata request/receipt/projection schemas remain unchanged.
11. Desktop remains canonical authority.
12. Chrome remains request-only and read-only over canonical metadata.
13. Product metadata sync remains globally NOT READY.

## Control-Plane Manifest

Schema:

`h2o.studio.sync.webdav-transport-control-plane.v1`

The Phase 31 manifest is a proof artifact only. It contains:

- `phase: phase31-webdav-local-sandbox-proof`
- `proofOnly: true`
- `sandboxOnly: true`
- `sandboxRootHash`
- `devOnlyWriteFlagRequired`
- `activeTransport: local-sync-folder-json`
- `remoteFilesWrittenOutsideSandbox: false`
- `productSyncReady: false`
- `latestFileHash`
- `chromeLatestFileHash`
- redacted `remoteRootRef`
- redacted `safePeerDirectory`
- redacted `peerIdentity`
- `privacyRedactionStatus`
- guard status codes

It does not contain unredacted endpoints, credentials, account metadata, chat-title text,
chat-content text, label display text, tag display text, or category display text.

## Byte-Unchanged Proof

The validator builds deterministic sample `latest.json` and `chrome-latest.json` envelope text,
records the SHA-256 hashes, writes those exact bytes into the local sandbox after the dev flag path is
accepted, reads them back, and asserts strict string equality.

This proves the transport proof carries the existing envelope bytes unchanged. It does not mutate the
metadata request, receipt, or projection envelope schemas.

## Fallback Proof

When WebDAV is disabled by default, the Phase 30 guard reports:

- active transport: `local-sync-folder-json`
- local sync-folder JSON active: `true`
- WebDAV writes enabled: `false`
- remote files written: `false`

The Phase 31 validator asserts no sandbox files are written on default-disabled or missing-dev-flag
paths. This keeps the product path on local sync-folder JSON.

## Safety / Authority

- Desktop remains canonical authority.
- Chrome remains request-only and read-only over canonical metadata.
- WebDAV remains proof-only and dumb transport.
- No Chrome canonical mutation.
- No applied request type expansion.
- No destructive behavior.
- No hard delete.
- No purge.
- No chat delete.
- No snapshot delete.
- No asset delete.
- No label delete.
- No tag delete.
- No category delete.
- No metadata delete.

## Privacy

The validator and evidence use only hash/redacted proof values. The sandbox root is recorded only as a
hash. The manifest records peer and remote root details as hashes/redacted labels only. No secret,
endpoint, credential, chat-title text, chat-content text, label display text, tag display text,
category display text, or account-linked metadata appears in evidence.

## Validator

`tools/validation/sync/validate-labels-tags-categories-phase31-webdav-local-sandbox-proof.mjs`

The validator also checks:

- Phase 31 evidence exists.
- Phase 30 validator exists and still passes in the broader validation chain.
- `webdav: 'deferred'` remains present in the Desktop and Chrome sync diagnostics source.
- The source applied allowlist remains exactly four types.
- Phase 30 gate constants still report local sync-folder JSON as active.
- Product metadata sync remains globally NOT READY.

## Phase 31 Verdict

PASS. Phase 31 proves the WebDAV path remains disabled by default, the explicit dev-only flag is
required before any sandbox behavior, the sandbox proof is local/temp only, `latest.json` and
`chrome-latest.json` are byte-unchanged in proof, manifest evidence is redacted/hash-only, fallback
stays on local sync-folder JSON, no remote writes occur outside the sandbox, and product metadata sync
remains globally NOT READY.

## Recommended Phase 32

Phase 32 should be a design-only review gate for whether to keep WebDAV at sandbox proof status or
prepare a narrowly scoped, dev-only loopback WebDAV server proof. It should still require
`webdav-dev-only-do-not-ship`, keep WebDAV disabled by default, keep local sync-folder JSON as the
product transport, preserve the four-type allowlist, and keep product metadata sync globally NOT READY.
