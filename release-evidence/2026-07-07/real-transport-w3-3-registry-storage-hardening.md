# Real Transport W3.3B Registry Storage Hardening

Verdict: W3.3B IMPLEMENTS LOCAL REGISTRY STORAGE HARDENING ONLY. NO WRITE AUTHORIZATION.

This evidence closes the W3.3A F1 storage-location blocker for future
write-grade readiness by moving the default Desktop WebDAV descriptor registry
model from legacy temp storage to an app-owned local data path with redacted
owner and permission checks. This phase does not implement a write command,
does not mint a write-grade receipt, and does not perform any WebDAV/cloud/
relay/CAS/file write.

## Anchors

- W3.3A write-grade receipt / approval gate design: `671fdc1c855b345185e5ea257b206c0a07cdab36`
- W3.1 live read-only WebDAV closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.2 mock executor proof: `649849e7e48c7e5bc5924bc811d857f2435866ae`

## F1 Resolution

W3.3A recorded F1: the current live descriptor registry under `/private/tmp`
is not acceptable for write-grade registry material.

W3.3B resolves the storage-location and permission side of F1 for future
write-grade readiness:

- default Desktop setup writes now target an app-owned local data registry path
  classified as `app-local`
- an explicit env-selected path is classified as `env`
- the previous `/private/tmp` default remains available only as
  `default-private-legacy`
- an empty or unusable env override is classified as `invalid`
- `default-private-legacy` is not write-grade eligible
- `invalid` is not write-grade eligible

Legacy temp storage may still be read for setup/status compatibility and for
old read-only evidence continuity. It must not be silently inherited into any
future write-grade execution.

## Path Source Model

Redacted path-source classes:

- `app-local`: app-owned Desktop local data registry path
- `env`: explicit env-selected registry path for dev/probe or future invocation-local use
- `default-private-legacy`: legacy temp registry fallback, not write-grade
- `invalid`: unusable path selection, fail closed

Write-grade eligibility rule:

- `app-local` may be eligible only when owner and permission checks pass
- `env` may be eligible only when explicitly approved as invocation-local and
  owner and permission checks pass
- `default-private-legacy` is never write-grade eligible
- `invalid` is never write-grade eligible

## Permission And Owner Checks

The Desktop resolver status now reports redacted storage-hardening booleans:

- `writeGradeRegistryEligible`
- `registryFileOwnerCurrentUser`
- `registryFilePrivatePermissions`
- `registryParentOwnerCurrentUser`
- `registryParentPrivatePermissions`

On Unix/macOS, the registry writer creates parent directories and then attempts
owner-only directory permissions. Registry files are written with owner-only
read/write permissions. Status checks require the file owner to match the
current process user, the file to have no group/world permission bits, the
parent owner to match the current process user, and the parent to avoid
group/world writable permission bits.

If platform permission checks are limited, write-grade eligibility remains
false until a platform-specific guarded model is implemented.

## Hash Boundary

Existing W3.1 setup/read-only `descriptorRegistryRefHash` semantics are not
changed retroactively. The existing exact-file registry hash remains an
out-of-repo private registry hash and no registry preimage is committed.

For future write-grade receipts, W3.3A requires that evidence preimages do not
include secret material or secret-derived fingerprints. W3.3B hardens storage
location and permissions but does not mint a write-grade canonical descriptor
hash. If the exact private registry hash is unsuitable for write-grade receipt
evidence, a separate W3.3C canonical hash split must define the secret-free
write-grade descriptor binding before W3.4a live-write readiness.

## Compatibility

- Existing read-only/setup behavior remains available.
- Saved credential behavior and reload hydration remain preserved.
- Status/UI output shows only redacted source classes and booleans.
- No raw path is shown in normal UI status.
- No private registry contents are committed.

## Boundary Confirmations

- W3.3B is storage hardening only
- W3.3B does not authorize writes
- no live WebDAV probe was performed in this phase
- no WebDAV/cloud/relay/CAS/file write occurred
- no forbidden WebDAV method was used
- no write-grade receipt was minted
- no one-shot token was generated
- no kill-switch token was generated
- `h2o_rt_first_write` remains absent / not implemented in this phase
- no write command was added
- no token/export-id/sequence burn occurred
- no relay/outbox/ledger/store mutation occurred
- no fullBundle.v3 start or mint occurred
- `productSyncReady:false`
- `transportReady:false`

## W3.4 Gate Impact

W3.4a may proceed only after:

- registry source is `app-local`, or an explicitly approved invocation-local
  `env` path is used
- owner and permission checks pass
- `default-private-legacy` is not used for write-grade material
- any required W3.3C secret-free canonical hash boundary is complete
- a separate refused-by-default command/validator phase is explicitly approved

W3.4b live sacrificial invocation still requires a separate operator go. This
evidence does not approve PUT, does not approve cleanup, and does not make
`productSyncReady` or `transportReady` true.
