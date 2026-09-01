# Saved Chat Storage ↔ Transport Object Handoff Contract

Status: Normative / M07 COMPLETE / ACCEPTED; G2 passed 2026-09-01

Date: 2026-08-31

Lane: 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization

Mission: M07 — Storage ↔ Transport Object Handoff

Related:

- [Saved Chat Package v3 Contract](saved-chat-package-v3.md)
- [Saved Chat Archive Generations Contract](saved-chat-generations.md)
- [Saved Chat Archive Reclamation Contract](saved-chat-reclamation.md)
- [ADR-0010 — Saved Chat Asset CAS](../../decisions/ADR-0010-saved-chat-asset-cas.md)
- [M07 acceptance record](../../../release-evidence/2026-09-01/saved-chat-storage-m07-acceptance.md)

## 1. Bounded outcome

M07 establishes the trusted local boundary by which Saved-Chat Storage exposes
one verified saved-chat package as a deterministic set of immutable byte
objects. Transport receives metadata plus bounded reads through an opaque,
process-local session. It receives no local filesystem authority and M07
receives no remote-policy authority.

This Mission does not build WebDAV, cloud or relay transport. It does not
publish, enqueue, mint, burn, retain remotely, converge peers, or delete local
storage.

The implemented first slice supports every package family admitted by the
current authoritative Rust verifier: v1 and v2 generation packages, plus
grandfathered legacy packages selected explicitly by semantic chat identity.
Live v3 remains OFF. Future v3 handoff admission is conditional on the existing
authoritative verifier first admitting v3; M07 must then carry its verified
encoding/logical descriptor fields and its version-aware two-member rule.

## 2. Authority and ownership

| Concern | Owner | M07 rule |
| --- | --- | --- |
| Package discovery and local location | Saved-Chat Storage | Derived trusted-side from semantic identity; never caller path authority. |
| Package verification and `contentHash` | Saved-Chat Storage / existing package verifier | Reused unchanged; no second verifier or identity algorithm. |
| Physical object identity and `representationHash` | Saved-Chat Storage / M07 | Derived from exact opened stored bytes and canonical object metadata. |
| Asset dependency set | Saved-Chat Storage / verified manifest | Complete verified manifest set; missing or corrupt canonical CAS object refuses BEGIN. |
| Local object opening and bounded reads | Saved-Chat Storage / M07 | Descriptor-relative `O_NOFOLLOW` opens retained for the session. |
| Session lifetime and local resource bound | Saved-Chat Storage / M07 | Process-local, bounded, lazily expiring, no durable lease. |
| Endpoint, credentials, peer identity and remote root | Transport | Excluded from M07. |
| WebDAV/cloud/relay writes and remote layout | Transport | Excluded from M07. |
| Conflict, retry and convergence policy | Sync / Transport | Excluded from M07. |
| Outbox and publication ledger | Transport | Excluded from M07. |
| Export-id minting and sequence burning | Transport | Excluded from M07. |
| Encryption/E2E and remote retention | Transport / Sync | Excluded from M07. |
| Local reclamation, retention and quarantine | M06 | Unchanged; M07 adds no destructive authority or policy root. |

## 3. DP-M07-A — two-layer identity: RESOLVED / APPROVED

### Logical package identity

The existing verified package `contentHash` answers:

> What logical saved-chat generation is this?

M07 does not redefine it:

- v1 remains the exact stored `snapshot.json` SHA-256;
- v2 remains the frozen snapshot-plus-sorted-asset descriptor SHA-256;
- future v3 remains the encoding-independent logical identity already frozen
  by the v3 contract.

### Physical handoff identity

The new `representationHash` answers:

> What exact immutable bytes/object-set does this handoff expose?

It is a lowercase `sha256-<64 hex>` SHA-256 over UTF-8 compact JSON with no
trailing whitespace. The preimage fields occur in exactly this order:

```text
schema
version
packageKind
logicalIdentity { chatId, contentHash }
constructionFamily
schemaVersion
payloadVersion
objectCount
totalPhysicalBytes
objects
```

The preimage schema is:

```text
h2o.savedChatTransportRepresentation.v1
```

Before serialization, objects are sorted by:

1. role rank: `manifest`, `snapshot`, `markdown`, `html`, `asset`;
2. `storedSha256` ascending;
3. `byteLength` ascending;
4. `objectId` ascending.

Every object preimage carries, in field order:

```text
objectId, role, mediaType, storedSha256, byteLength,
encoding?, logicalSha256?, logicalByteLength?
```

Optional logical/encoding fields are omitted when the authoritative package
descriptor does not expose them. V1/v2 therefore do not acquire invented v3
semantics.

`representationHash` and `contentHash` are deliberately separate. Changing
only presentation bytes, manifest serialization, or a future physical member
encoding may change `representationHash` while the package's frozen logical
`contentHash` remains unchanged.

## 4. DP-M07-B — transport object set: RESOLVED / APPROVED

The handoff exposes blobs, not paths.

Current v1/v2 ordered roles are:

1. `manifest` — exact verified `manifest.json` bytes;
2. `snapshot` — exact verified `snapshot.json` bytes;
3. `markdown` — exact descriptor-governed `chat.md` bytes;
4. `html` — exact descriptor-governed `chat.html` bytes;
5. zero or more `asset` bodies, sorted by verified manifest SHA-256.

Fixed object IDs are `manifest`, `snapshot`, `markdown`, and `html`. Assets use
`asset-000000`, `asset-000001`, ... after deterministic SHA ordering. Object
IDs are session-local semantic handles, never member names, package paths, CAS
paths, or remote paths.

Every object carries:

- `role`;
- `mediaType`;
- exact `storedSha256`;
- exact `byteLength`;
- verified encoding/logical metadata only where the package family exposes it.

Manifest, snapshot, Markdown, and HTML objects are opened beneath the verified
package directory returned by the existing verifier. Each opened handle is
stream-hashed and length-checked before admission. The manifest's expected
physical identity is the exact manifest byte vector consumed by that same
verification pass, closing a verify-then-reopen drift.

### Asset semantics

The dependency set is exactly `verifiedManifest.assets` — never renderer input
and never an inferred scan of chat bodies. Each canonical asset body is located
through the existing trusted CAS SHA-to-shard authority, opened with
`O_NOFOLLOW`, and verified against the manifest SHA and byte length before the
session is installed.

The public descriptor contains the asset's hash, length, role and verified MIME
type. It does not contain its manifest member path, extension-derived local
path, CAS shard, CAS basename, or filesystem key.

If any declared asset is absent, non-regular, unreadable, hash-mismatched, or
length-mismatched, BEGIN fails and exposes no partial descriptor. An asset is
never silently dropped.

The current trusted verifier refuses duplicate asset-SHA descriptors in the
manifest. Repeated references to the same verified SHA in snapshot content do
not create additional physical handoff objects: M07 enumerates the verified
manifest dependency set once, so reference order cannot multiply object bytes.

Future v3 admission must use current version-aware truth: app-owned v3 does not
inherit v1/v2 Markdown/HTML requirements, and verified v3 encoding,
`contentSha256`, and `contentByteLength` must be carried without reinterpretation.

## 5. DP-M07-C — no caller path authority: RESOLVED / APPROVED

The only admitted selectors are:

```json
{
  "kind": "generation",
  "chatId": "semantic-chat-id",
  "contentHash": "sha256-<64 hex>"
}
```

and the explicit grandfathered legacy selector:

```json
{
  "kind": "legacy",
  "chatId": "semantic-chat-id"
}
```

The Rust input schema refuses unknown fields. There is no field for archive,
package, member, CAS or remote paths; filesystem handles; overwrite/force;
credentials; endpoints; or policy state.

Rust validates `chatId` through the publisher's existing authority, normalizes
the content-hash assertion through the existing SHA helper, derives the
generation name through the existing generation constructor, and derives the
legacy name beside the existing package-name parser. The verifier recomputes
identity from stored bytes. A selector can only select or refuse; it can never
make its claimed identity authoritative.

## 6. DP-M07-D — stable retained-handle session: RESOLVED / APPROVED

### Protocol

```text
BEGIN { selector }
  → { opaque token, descriptor }

READ { token, objectId, offset, maxBytes }
  → { bytes, offset, nextOffset, eof }

END { token }
  → closes every retained object handle
```

BEGIN performs all verification and exact object opening before making the
session visible. It holds already-open regular-file handles to the verified
package members and canonical asset objects. READ looks up only `token` and
`objectId`, seeks that retained handle, and reads a bounded window. It never
re-resolves a package or CAS pathname.

On Unix, an open file descriptor continues to name the opened inode across a
pathname rename or unlink. Therefore an admitted session remains byte-stable
if M06 or an operator subsequently moves/unlinks the pathname, while a new
BEGIN against the now-absent semantic identity fails. This property is pinned
by a permanent rename-plus-unlink regression test.

BEGIN publishes only after every package member and canonical CAS dependency
has been opened and checked. A concurrent namespace rename/unlink therefore
either leaves a complete self-consistent opened object set or makes BEGIN fail
without publishing a session; partially opened handles are dropped.

Published generations and governed CAS objects are immutable within H2O's
authority. Retained handles protect identity across namespace rename/unlink;
they do not claim protection against an unrelated privileged external process
that mutates an already-open inode in place.

No durable pin, staging copy, retention-policy modification, process-exit hook,
or filesystem lease is introduced.

## 7. Session and read safety

- Tokens are seeded from OS entropy and cross JSON as decimal text, preserving
  the full `u64` value. JSON numbers are refused. Tokens are opaque identifiers,
  not authorization secrets or arithmetic inputs.
- Active plus in-progress BEGIN sessions are capped at four, reusing the
  publisher's existing operational session bound.
- The idle timeout is 15 minutes, reusing the publisher's operational timeout.
  Eviction is lazy on BEGIN; an active READ/END lease is never evicted beneath
  the operation.
- Eviction marks the session ended and drops every handle. A crash drops the
  whole process-local registry automatically.
- READ requires `1 <= maxBytes <= 256 KiB`, reusing the existing streaming
  window. This is an IPC/allocation bound, never an object or package-size cap.
- `offset + maxBytes` uses checked arithmetic. Overflow, out-of-range offsets,
  unknown tokens, unknown object IDs, short reads and seek/read failures refuse.
- END removes the token before closing handles and coordinates with an in-flight
  bounded READ. Repeated/unknown END safely refuses with
  `transport-handoff-session-unknown`.
- No call materializes a whole object unless the object itself fits within one
  explicitly requested bounded window.

## 8. Public handoff descriptor

The normative public schema is:

```text
h2o.savedChatTransportHandoff.v1
```

Conceptual JSON shape (v1 example):

```json
{
  "schema": "h2o.savedChatTransportHandoff.v1",
  "version": 1,
  "representationHash": "sha256-<64 hex>",
  "logicalIdentity": {
    "chatId": "semantic-chat-id",
    "contentHash": "sha256-<64 hex>"
  },
  "packageKind": "saved-chat-package",
  "constructionFamily": "v1",
  "schemaVersion": 1,
  "payloadVersion": null,
  "objectCount": 4,
  "totalPhysicalBytes": 1234,
  "objects": [
    {
      "objectId": "manifest",
      "role": "manifest",
      "mediaType": "application/json",
      "storedSha256": "sha256-<64 hex>",
      "byteLength": 456
    }
  ]
}
```

The descriptor is metadata-only. It contains no message bodies, chat title,
absolute or archive-relative local path, package basename, member path, CAS
path/key/shard, endpoint, credential, remote path, approval token, sequence,
export ID, outbox state, publication ledger state, or Sync convergence state.

## 9. Failure and refusal model

All domain refusals return `ok: false` plus a stable blocker code; they expose
no partial session authority.

| Family | Examples |
| --- | --- |
| Selector | invalid chat/hash grammar; unknown/path-shaped fields rejected by deserialization |
| Package admission | missing, symlinked, partial, corrupt, unreadable, identity-mismatched or unsupported family |
| Object admission | member absent/non-regular/unreadable; stored hash/length mismatch |
| Asset completeness | canonical CAS absent/unreadable; stored hash/length mismatch |
| Resource | bounded session admission exhausted; object-set byte/count overflow |
| Session/read | unknown token/object, invalid bound, offset overflow/out-of-range, seek/read failure |

Refusal never repairs, rewrites, quarantines, deletes, renames, publishes, or
reclaims anything.

## 10. Version and legacy behavior

- Current v1 and v2 packages keep their frozen identity and four required
  package members.
- Grandfathered `<chatId>.h2ochat` is supported only through the explicit
  semantic `{kind: legacy, chatId}` selector. A raw legacy basename/path is not
  accepted.
- Generation selection requires `{chatId, contentHash}` and derives the only
  candidate generation basename trusted-side.
- Live v3 remains OFF. The current verifier's v3 refusal is preserved.
- When a future accepted verifier admits v3, M07 must branch on that verified
  family, omit non-persistent renderers, and carry verified physical/logical
  descriptor semantics. It must not reinterpret v1/v2 fields or require v3-only
  members from older packages.

## 11. Cross-Lane Transport compatibility

M07 changes no Sync source. Its contract maps to the existing B4/B6 hash-only
boundaries as follows:

```text
M07 representationHash = sha256-<hex>
Transport hash reference = sha256:<same hex>
```

The conversion is permitted only after validating the complete M07 syntax
`^sha256-[0-9a-f]{64}$`, and is exactly
`"sha256:" + representationHash.substring("sha256-".length)`. It performs no
truncation, alternate digest, or payload/body derivation. B4 receives the result
as `candidatePayloadHash`; B6 receives the same result identically as both
`candidatePayloadHash` and `candidateBundleHash`.

For a Transport candidate whose payload is exactly this handoff object set:

- B4 `candidatePayloadHash` receives only the normalized colon-prefixed hash
  reference;
- B6 `candidatePayloadHash` and `candidateBundleHash` receive that same hash
  reference, satisfying their checksum-equality condition;
- individual `storedSha256` values remain descriptor/object-integrity facts and
  are not supplied as `casKey`, `casKeyHash`, `chatSavingCasKey`, or `casKeys`;
- the M07 token is local Storage session state and is never supplied to B4/B6;
- object bytes are consumed by a future Transport-owned adapter, not placed in
  the hash-only B4/B6 evaluate requests as raw payload fields.

The existing boundaries continue to reject raw endpoint, credential, remote
path, payload authority and chat-saving CAS authority. A consuming adapter, if
needed, is a separate cross-Lane Task after the producer is accepted.

## 12. Phases, tasks and gates

### P0 — Contract & Core Slice

- Freeze DP-M07-A through DP-M07-D.
- Freeze descriptor, two-layer identity and session protocol.
- Implement the core registry, verification/open path and representation hash.

### P1 — Trusted Handoff Engine

- Admit exact verified v1/v2 generation and explicit legacy packages.
- Prove asset completeness from verified manifest plus trusted CAS.
- Implement bounded BEGIN/READ/END and stable open-handle behavior.

### P2 — Cross-Lane Compatibility

- Preserve the hash-only B4/B6 mapping above.
- Prove no raw path/CAS authority and no Sync ownership drift.
- Admit a consuming adapter only as a separately scoped cross-Lane Task.

### P3 — Hardening & Acceptance

- Run focused adversarial and compatibility regression.
- Produce only concise durable acceptance evidence if required.
- Form one coherent guarded commit and obtain independent final acceptance.

Gates:

- **G0 — contract/core authority frozen.** DP-M07-A through D, schema and
  refusal model are normative; core implementation and focused tests exist.
- **G1 — trusted handoff engine accepted.** Exact object/asset admission,
  bounded lifecycle and retained-handle stability are accepted.
- **G2 — final cross-Lane M07 acceptance.** Hash-only compatibility and all
  final Mission criteria are accepted without ownership drift.

M07 is non-destructive; no G02-style destructive activation gate applies.

## 13. Acceptance criteria

- **AC-M07-01 — Deterministic descriptor.** A deterministic versioned handoff
  descriptor is produced from canonical metadata and ordered objects.
- **AC-M07-02 — Two-layer identity.** Existing logical `contentHash` and new
  physical `representationHash` remain separate and bind the facts defined in
  DP-M07-A.
- **AC-M07-03 — Verified admission only.** Only state admitted by the existing
  trusted package verifier may begin a handoff.
- **AC-M07-04 — No caller path authority.** No caller-supplied local path or CAS
  path/key becomes authority.
- **AC-M07-05 — Exact physical identity.** Every exposed object carries its
  verified stored-byte SHA-256 and byte length.
- **AC-M07-06 — Asset completeness.** Every verified manifest asset dependency
  is represented completely or BEGIN fails closed.
- **AC-M07-07 — Bounded reads.** Object reads are explicit bounded windows and
  never require unbounded whole-object IPC materialization.
- **AC-M07-08 — Stable open handles.** An admitted session remains byte-stable
  across package pathname rename/unlink; a new BEGIN against the missing name
  refuses.
- **AC-M07-09 — Ephemeral lifetime.** END, expiry and crash leave no durable
  stale session authority.
- **AC-M07-10 — No Transport ownership.** M07 performs no remote/WebDAV/cloud,
  outbox, ledger, export-id or sequence write.
- **AC-M07-11 — Metadata minimization.** Public metadata exposes no raw local
  path, credential, endpoint, remote path or local CAS filesystem authority.
- **AC-M07-12 — Hash-only compatibility.** Existing Transport B4/B6 hash-only
  compatibility is proven at contract level without a Sync source change.
- **AC-M07-13 — Version compatibility.** Current verified v1/v2 and explicit
  legacy packages remain supported, while future v3 logical/physical semantics
  are not contradicted.
- **AC-M07-14 — Preservation.** M05/M06 publication, verification, retention,
  quarantine and reclamation invariants remain unchanged.

## 14. Definition of Done

M07 is Complete only when:

1. G0, G1 and G2 pass;
2. the normative contract and producer implementation agree;
3. focused tests prove deterministic identity, exact objects, complete assets,
   semantic-only authority, bounded lifecycle and rename/unlink stability;
4. relevant existing package verification and renderer-no-mutation pins remain
   green;
5. no Sync-owned implementation, remote transport, destructive policy, schema
   migration, UI or production data activation is introduced; and
6. the coherent change is reviewed and accepted through the Lane's guarded
   checkpoint process.

The current P0/P1 implementation slice does not by itself declare the whole
Mission Complete.

## 15. M08 handoff

M08 continues to own ZIP/export containers. It may consume a future accepted
M07 session as a bounded immutable object source, but M07 does not define ZIP
entry layout, compression method, export destination, human-readable export
policy or container reproducibility. M08 must not reinterpret
`representationHash` as ZIP archive-byte identity unless it separately defines
and accepts that mapping.
