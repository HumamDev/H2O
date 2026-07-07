# Real Transport W3.3C Write-Grade Registry Hash Boundary

Verdict: W3.3C DEFINES THE WRITE-GRADE EVIDENCE-SAFE REGISTRY HASH BOUNDARY. NO WRITE AUTHORIZATION.

This evidence defines the canonical write-grade registry hash boundary after
W3.3B storage hardening. It does not change W3.1/W3.2 evidence retroactively,
does not mint a write-grade receipt, and does not perform any WebDAV/cloud/
relay/CAS/file write.

## Anchors

- W3.3B registry storage hardening: `388a952745ab7a21ba9556531eccf5c7e0ffe1ce`
- W3.3A write-grade receipt / approval gate design: `671fdc1c855b345185e5ea257b206c0a07cdab36`
- W3.2 mock executor proof: `649849e7e48c7e5bc5924bc811d857f2435866ae`
- W3.1 live read-only WebDAV closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`

## Current Hash Diagnosis

The existing `descriptorRegistryRefHash` is computed over the exact private
registry JSON bytes. That exact private registry contains private transport
material outside the repo, including endpoint material, remote-root material,
and private auth material. Therefore `descriptorRegistryRefHash` is a
local/private-content hash, not a write-grade evidence-safe hash.

`descriptorRegistryRefHash` remains available for W3.1/read-only compatibility
and local resolver continuity. It must not be used as the committed
write-grade receipt evidence hash.

## Canonical Write-Grade Hash Names

Chosen names:

- `descriptorRegistryRefHash`: legacy/read-only exact private content hash;
  local compatibility only; not write-grade evidence-safe
- `writeGradeRegistryRefHash`: write-grade evidence-safe public descriptor
  hash
- `writeGradeRegistryHashBoundary`:
  `descriptor-refs-only-excludes-private-material`
- `privateContentHashAvailable`: redacted boolean proving a private content
  hash can be computed locally without exposing it

## Write-Grade Evidence-Safe Hash Boundary

`writeGradeRegistryRefHash` is computed from a canonical public descriptor-ref
object:

```yaml
schema: h2o.studio.transport.write-grade-registry-public-ref.v1
hashBoundary: descriptor-refs-only-excludes-private-material
descriptorMode: hash-only-redacted
endpointRefHash: sha256:<hash>
remoteRootRefHash: sha256:<hash>
credentialRefHash: sha256:<hash>
```

Included in `writeGradeRegistryRefHash`:

- canonical schema
- explicit hash boundary name
- descriptor mode
- endpoint descriptor ref hash
- remote-root descriptor ref hash
- credential descriptor ref hash

Excluded from `writeGradeRegistryRefHash` and from committed write-grade
evidence:

- raw endpoint
- raw remote root or folder
- username or credential identifier
- password/token
- auth header
- private registry JSON
- response body
- listing
- any secret-derived fingerprint

## Future Executor Verification Model

Before any future sacrificial PUT is allowed, the executor must verify:

- registry source is `app-local`, or an explicitly approved invocation-local
  `env` path
- registry source is not `default-private-legacy`
- owner and permission checks pass
- `writeGradeRegistryEligible:true`
- `writeGradeRegistryRefHash` matches the write-grade receipt binding
- private registry content is loaded immediately before the future PUT
- private content is validated locally for required private fields
- any exact private content hash remains local-only/internal and is not
  committed as evidence

This model lets a future write-grade receipt bind public descriptor refs safely
while still forcing the executor to re-open and validate the private registry
immediately before network execution.

## UI And Status Boundary

The WebDAV setup status can expose:

- `writeGradeRegistryRefHash`
- `writeGradeRegistryHashBoundary`
- `privateContentHashAvailable`
- `writeGradeRegistryEligible`
- `registryPathSource`
- owner and permission booleans

The UI must not display the exact private-content `descriptorRegistryRefHash`
as the write-grade registry hash. The UI may show only that a private content
hash is available.

## Boundary Confirmations

- W3.3C is no-write / evidence-validator / local-status only
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

Future W3.4a refused-by-default implementation may bind
`writeGradeRegistryRefHash` in the receipt schema. W3.4b live invocation still
requires a separate operator go, explicit write-grade receipt, explicit
approval, one-shot token, kill-switch token, and create-only request budget.

This evidence does not authorize PUT, does not authorize cleanup, and does not
make `productSyncReady` or `transportReady` true.
