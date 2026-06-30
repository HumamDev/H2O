# Labels / Tags / Categories / Classification Metadata Sync

## Phase 27 Design-Only WebDAV / Cloud / Relay Transport Audit

Date: 2026-06-29

## Status

DESIGN-ONLY. No transport was implemented. No source modules were modified. No runtime behavior
changed. No fifth request type was added. The applied allowlist is unchanged at exactly four types and
WebDAV remains marked deferred in source. This phase produces a transport design + threat/recovery
model and gates; implementation is deferred behind its own Gate A/B/C and a later explicit dev flag.

## Context

- Phase 26 stabilization/closeout committed: `1991e28`
  (`release-evidence/2026-06-25/labels-tags-categories-phase26-stabilization-closeout.md`,
  `tools/validation/sync/validate-labels-tags-categories-phase26-stabilization-closeout.mjs`).
- Stabilized four-type loop: `chat-category-assign`, `chat-category-clear`, `chat-label-bind`,
  `chat-tag-bind`. Product metadata sync remains NOT READY globally.
- Current transport: local sync-folder JSON only — `chrome-latest.json` (Chrome → Desktop request
  export) and `latest.json` (Desktop → Chrome canonical projection + receipts).
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`
  (`release-evidence/2026-06-29/webdav-cloud-relay-architecture-memo.md`).

## 1. Memo Evaluation Against the Stabilized Four-Type Baseline

The architecture memo predates the four-type stabilization. Re-evaluated against the current baseline:

- The memo's premise (move from a local shared folder to a shared remote location holding the same
  bundle files) is compatible with the stabilized loop, because the loop already treats transport as
  a dumb file channel.
- Existing, currently-deferred scaffolding is present and must NOT be wired in by this phase:
  `src-surfaces-base/studio/sync/webdav-relay.tauri.js`, `relay-inbox.tauri.js`,
  `relay-index.tauri.js`, `relay-outbox.tauri.js`, `peer-discovery.js`, `peer-identity.js`,
  `peer-transport.js`, `peer-watermarks.js`, `multi-peer-diff.js`, `multi-peer-runner.js`.
- There is already an envelope-agnostic transport seam: `export-bundle.tauri.js` optionally writes the
  latest mirror through `H2O.Studio.sync.peerTransport.writeLatestMirror`
  (schema `h2o.studio.sync.peer-transport.v1`). A remote transport implements this seam; it carries the
  same `latest.json` mirror unchanged and does not touch envelope shape.

Verdict: the memo is a viable design basis IF reduced strictly to dumb transport of the existing
envelopes; its broader multi-peer/relay ambitions stay deferred.

## 2. Transport Boundary

- WebDAV/cloud/relay carries the SAME request/receipt/projection envelopes unchanged:
  `chrome-latest.json` (Chrome → Desktop requests) and `latest.json` (Desktop → Chrome canonical
  projection `desktopCanonicalLibraryMetadata` + `libraryMetadataMutationReceipts[]`).
- It MUST NOT introduce new applied request types and MUST NOT introduce new schemas. The transport is
  byte-for-byte a move of the same files to a remote location; the envelope schemas
  (`h2o.studio.library-metadata-mutation-request.v1`,
  `h2o.studio.library-metadata-mutation-receipt.v1`,
  `h2o.studio.library-metadata.desktop-canonical.v1`) are unchanged.
- The transport is a channel only; it performs no validation, apply, or projection. All validation and
  apply stay on Desktop exactly as today.

## 3. Artifacts That May Be Transported

- `latest.json` (Desktop → Chrome canonical projection + receipts)
- `chrome-latest.json` (Chrome → Desktop request export)
- receipts (carried inside `latest.json`'s `libraryMetadataMutationReceipts[]`)
- peer manifests (device/peer descriptor: peer-id hash, schema/version, sequence number — hash-only)
- checksums (per-file content SHA-256 for integrity)
- per-device state (last-seen sequence number, last-applied export id, watermark — hash/counter only)

## 4. Artifacts That MUST NOT Be Transported

- raw chat content, raw chat titles, raw label/tag/category names, raw colors
- account-linked metadata or any account identifier
- SQLite database files or raw store rows
- credentials, tokens, or secrets (these are local config, never part of a transported bundle)
- snapshots, assets, or chat bodies
- any new schema or any applied-type definition

## 5. Authority Model

- Desktop remains the canonical authority: only Desktop validates and applies; only Desktop writes
  `desktopCanonicalLibraryMetadata`.
- Chrome remains request-only and read-only over canonical metadata: it exports requests and imports
  the projection + receipts read-only; no Chrome canonical mutation.
- Relay/cloud/WebDAV acts only as DUMB TRANSPORT: it stores and forwards opaque files. It never
  validates, applies, merges, transforms, or interprets envelope contents. Moving authority to a relay
  is an explicit non-goal (negative gate).

## 6. Privacy / Security Requirements

- Transported envelopes are already redacted/hash-only (the four-type loop's request/receipt/projection
  payloads carry hashes, statuses, counts — never raw titles/content/names/account-linked metadata).
  The transport must preserve this and add nothing raw.
- In transit: TLS-only (HTTPS WebDAV / HTTPS object store). No plaintext transport.
- At rest (remote): the remote holds only the already-redacted envelopes; optional client-side
  encryption-at-rest is a design extension, not a baseline requirement, because envelopes are hash-only.
- Credential/auth handling: credentials live in local Desktop config only, never in a transported
  bundle, never in evidence, never logged. Auth is per-device; revocation is local.
- No raw secrets in evidence: any future proof must redact endpoints/credentials and assert no secret
  appears in captured artifacts.

## 7. Conflict / Idempotency Model

- stale writes: each export carries a monotonically increasing `sequenceNumber` + `exportId` +
  `previousExportId`; an importer ignores an export whose sequence is older than its last-applied.
- duplicate exports: import dedupes by content SHA-256 + `exportId`; a re-seen bundle is a no-op
  (mirrors the existing local duplicate-import idempotency).
- sequence numbers + per-peer IDs: every bundle is stamped with a `peerIdHash` and `sequenceNumber`;
  the importer keeps per-peer watermarks (last-applied sequence) to order writes.
- basis-hash / stale_basis handling: unchanged from the four-type loop — a request's
  `expectedCurrentBasisHash` is compared against the current Desktop projection; mismatch →
  `stale_basis` receipt. Remote transport does not alter this; it only delivers the request later.
- replay / skipped_duplicate: unchanged — Desktop apply detects already-applied from current canonical
  state and emits `skipped_duplicate`; a remote replay of an old request cannot double-apply.

## 8. Recovery Model

- corrupt remote file: checksum mismatch → reject the file, keep last-known-good local state, surface a
  diagnostic; never apply a checksum-failed bundle.
- missing file: treat as "no update"; the loop continues on local state; no destructive action.
- partial upload: writers upload to a `.tmp` staging name then atomically rename (mirrors the existing
  `chrome-latest.json.tmp` staging pattern); readers ignore `.tmp` files, so a partial upload is never
  imported.
- stale peer state: per-peer watermarks + sequence numbers cause an importer to ignore an older peer's
  bundle; a returning old device cannot regress canonical state.
- rollback: Desktop canonical state is the source of truth and is never overwritten by transport; a bad
  remote state is recovered by Desktop re-exporting the current canonical projection.

## 9. Threat Model

- malicious remote overwrite: a tampered bundle fails checksum and/or sequence/peer-watermark checks and
  is rejected; Desktop canonical authority means a remote can never directly mutate canonical state.
- accidental old-device overwrite: prevented by monotonic `sequenceNumber` + per-peer watermarks
  (older sequence ignored).
- clock skew: ordering relies on sequence numbers and content hashes, NOT wall-clock timestamps, so
  skew cannot reorder applies; timestamps are advisory only.
- duplicate relay import: deduped by content SHA-256 + `exportId`; idempotent no-op.
- remote replay: an attacker re-uploading an old request still hits Desktop's basis-hash + current-state
  duplicate checks → `stale_basis` or `skipped_duplicate`; no double-apply, no canonical regression.

## 10. Transport Gate A / B / C

- **Gate A — design approval**: this audit + maintainer sign-off on the dumb-transport boundary,
  authority model, privacy, conflict/recovery/threat models, and the chosen single candidate. No code.
- **Gate B — validators / schema guard**: deterministic validators asserting the transport carries the
  envelopes byte-unchanged, introduces no new schema and no new applied type, preserves
  Desktop-canonical / Chrome-request-only, and enforces checksum + sequence + per-peer dedupe — all
  behind a disabled-by-default dev flag.
- **Gate C — dev-only live proof**: a dev-flag-gated end-to-end proof against a real remote endpoint
  (test credentials, redacted) showing request → remote → Desktop apply → receipt → remote → Chrome
  read-only import, with stale/duplicate/corrupt-file recovery exercised and no secret in evidence.

No transport writes ship without passing Gate A → B → C and an explicit dev flag.

## 11. Negative Gates (must hold across any transport work)

- no allowlist broadening (applied types stay exactly the four proven types)
- no destructive actions (no delete/remove/unbind/clear beyond the existing `chat-category-clear`
  carve-out; no purge/hard-delete)
- no authority move (Desktop stays canonical; Chrome stays request-only/read-only; relay stays dumb)
- no schema change (envelopes carried byte-unchanged)
- no product-ready claim (`productSyncReady` stays `false`; product metadata sync stays NOT READY
  globally until an explicit later closeout)

## 12. Transport Options Comparison

| Option | Model | Delta from current | Safety | Complexity | Notes |
| --- | --- | --- | --- | --- | --- |
| WebDAV | remote shared filesystem holding the same bundle files | smallest — same file-based model, plugs into the existing `peerTransport.writeLatestMirror` seam | high — dumb file store, TLS, atomic rename + checksum | low | most direct mirror of the current local-folder transport |
| Cloud object store (S3/R2/…) | remote object bucket of the same files | small — file/object model, but adds SDK/auth/eventual-consistency handling | high if read-after-write is configured | medium | viable alternative; more provider-specific surface |
| Relay | a server brokering messages between peers | large — introduces an active server component | lower — bigger attack surface, risks drifting from dumb transport | high | conflicts with the dumb-transport boundary; defer |

## 13. Recommendation

Recommend exactly one design-only candidate: **WebDAV**. It is the smallest delta from the current
local sync-folder JSON transport (it is "the same folder, but remote"), it preserves the dumb-transport
+ Desktop-canonical model with the least new surface, and it maps directly onto the existing
`H2O.Studio.sync.peerTransport.writeLatestMirror` seam carrying `latest.json` unchanged. Cloud object
store is a documented alternative for a later decision; relay is deferred (server component, largest
attack surface, conflicts with the dumb-transport boundary).

Implementation remains DEFERRED behind Gate A → B → C and an explicit dev flag. This phase approves the
design direction only.

## Design Verdict

READY — for a WebDAV design-only candidate (Gate A design basis). Implementation is deferred behind
Gate B/C + dev flag. No transport, schema, applied-type, authority, or behavior change was made.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. `productSyncReady` stays `false`. Transport design does not
change readiness; only the four applied types are runtime-proven, and transport stays deferred.

## Recommended Phase 28

Phase 28: a DESIGN-ONLY WebDAV transport Gate B schema/guard specification — define the deterministic
validators that would assert byte-unchanged envelopes, no new schema/applied type, preserved authority,
and checksum/sequence/per-peer dedupe, all behind a disabled-by-default dev flag — still no transport
writes, no allowlist change, no authority move, and `productSyncReady` stays `false`.
