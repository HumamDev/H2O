# Labels / Tags / Categories / Classification Metadata Sync

## Phase 32 WebDAV Loopback Sandbox Proof

Date: 2026-06-30

## Status

Phase 32 is a dev-only local loopback WebDAV sandbox proof. It does not enable product WebDAV
transport, does not use a real remote WebDAV account, does not make external network calls, and does
not change product sync semantics. The proof uses a validator-owned temporary local filesystem
sandbox only.

Phase 31 local WebDAV sandbox proof committed: `bccbdd4`.

## Scope

This phase validates a loopback-style local proof around the Phase 30/31 WebDAV gates:

- WebDAV remains disabled by default.
- Loopback sandbox behavior requires the explicit dev-only flag `webdav-dev-only-do-not-ship`.
- Without that flag, loopback operations are blocked.
- With that flag, only local temp/sandbox write and read operations are allowed.
- No product WebDAV transport is enabled.
- No real remote WebDAV account is used.
- No external network call is made.
- No write occurs outside the sandbox root.
- Local sync-folder JSON remains the active product transport.
- Product metadata sync remains globally NOT READY.

## Files Changed

- `release-evidence/2026-06-25/labels-tags-categories-phase32-webdav-loopback-sandbox-proof.md`
  - This evidence file.
- `tools/validation/sync/validate-labels-tags-categories-phase32-webdav-loopback-sandbox-proof.mjs`
  - New validator/proof harness.
  - Executes `src-surfaces-base/studio/sync/webdav-transport-gates.js` in a VM.
  - Creates a temporary local loopback sandbox under the OS temp directory.
  - Writes and reads proof copies of `latest.json`, `chrome-latest.json`, and a redacted
    control-plane manifest only after the explicit dev flag path is accepted.
  - Asserts every loopback path stays inside the sandbox root.
  - Removes the temporary sandbox after proof execution.

No product runtime source file changed in Phase 32.

## Proof Steps

The Phase 32 validator proves:

1. Phase 30 `H2O.Studio.sync.webdavTransportGates` installs and reports:
   - disabled-by-default WebDAV gates
   - active transport: `local-sync-folder-json`
   - `remoteFilesWritten: false`
   - `webdavWritesEnabled: false`
   - `productSyncReady: false`
2. Default WebDAV behavior is blocked:
   - `writeStatus: disabled`
   - blocker includes `webdav-disabled`
   - no loopback files are written
3. Write-capable loopback behavior without the dev flag is blocked:
   - `writeStatus: skipped-no-dev-flag`
   - blocker includes `webdav-dev-flag-required`
   - no loopback files are written
4. With `webdav-dev-only-do-not-ship`, the guard permits only local loopback proof behavior:
   - `writeStatus: dry-run-dev-flag-present-no-remote-write`
   - WebDAV product writes remain disabled
   - remote files outside the sandbox remain unwritten
5. The loopback proof writes only local/temp proof files:
   - `latest.json`
   - `chrome-latest.json`
   - `control-plane-manifest.json`
6. The loopback proof reads those same files back from the sandbox root.
7. `latest.json` and `chrome-latest.json` are carried byte-unchanged.
8. Sandbox path containment blocks path traversal and sibling-directory escape attempts.
9. The control-plane manifest is redacted/hash-only.
10. Local fallback remains active on guard failure.
11. The applied request type allowlist remains exactly:
    - `chat-category-assign`
    - `chat-category-clear`
    - `chat-label-bind`
    - `chat-tag-bind`
12. Metadata request/receipt/projection schemas remain unchanged.
13. Desktop remains canonical authority.
14. Chrome remains request-only and read-only over canonical metadata.
15. Product metadata sync remains globally NOT READY.

## Loopback Manifest

Schema:

`h2o.studio.sync.webdav-transport-control-plane.v1`

The Phase 32 manifest is a proof artifact only. It contains:

- `phase: phase32-webdav-loopback-sandbox-proof`
- `proofOnly: true`
- `loopbackOnly: true`
- `sandboxRootHash`
- `devOnlyWriteFlagRequired`
- `activeTransport: local-sync-folder-json`
- `externalNetworkCalls: false`
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
records the SHA-256 hashes, writes those exact bytes into the local loopback sandbox after the dev
flag path is accepted, reads them back, and asserts strict string equality.

This proves the loopback proof carries the existing envelope bytes unchanged. It does not mutate the
metadata request, receipt, or projection envelope schemas.

## Containment Proof

The validator resolves every target path against the temporary sandbox root before writing or reading
loopback files. It rejects:

- relative traversal outside the sandbox
- sibling-directory escape attempts
- any path that does not resolve below the sandbox root

The proof also records the write set and asserts every written file path remains inside the sandbox
root before cleanup.

## Fallback Proof

When WebDAV is disabled by default, the Phase 30 guard reports:

- active transport: `local-sync-folder-json`
- local sync-folder JSON active: `true`
- WebDAV writes enabled: `false`
- remote files written: `false`

The Phase 32 validator asserts no loopback files are written on default-disabled or missing-dev-flag
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

`tools/validation/sync/validate-labels-tags-categories-phase32-webdav-loopback-sandbox-proof.mjs`

The validator also checks:

- Phase 32 evidence exists.
- Phase 31 validator exists and still passes in the broader validation chain.
- Phase 30 validator exists and still passes in the broader validation chain.
- `webdav: 'deferred'` remains present in the Desktop and Chrome sync diagnostics source.
- The source applied allowlist remains exactly four types.
- Phase 30 gate constants still report local sync-folder JSON as active.
- Product metadata sync remains globally NOT READY.

## Phase 32 Verdict

PASS. Phase 32 proves the WebDAV loopback path remains disabled by default, the explicit dev-only flag
is required before any loopback sandbox behavior, the proof is local/temp only, `latest.json` and
`chrome-latest.json` are written and read byte-unchanged inside the sandbox only, manifest evidence is
redacted/hash-only, fallback stays on local sync-folder JSON, no external network or remote writes
occur, no writes occur outside the sandbox root, and product metadata sync remains globally NOT READY.

## Recommended Phase 33

Phase 33 should be a design-only gate for whether to keep WebDAV at loopback sandbox proof status or
prepare a narrowly scoped, dev-only local WebDAV server adapter proof. It should still require
`webdav-dev-only-do-not-ship`, keep WebDAV disabled by default, avoid real external accounts, keep
local sync-folder JSON as the product transport, preserve the four-type allowlist, and keep product
metadata sync globally NOT READY.
