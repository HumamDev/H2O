# Labels / Tags / Categories / Classification Metadata Sync

## Phase 28 WebDAV Gate B — Schema / Guard Specification

Date: 2026-06-29

## Status

DESIGN / SPECIFICATION ONLY. No WebDAV transport was implemented. No remote files are written. No
source modules were modified. No runtime behavior changed. No fifth request type was added. The
applied metadata request allowlist is unchanged at exactly four types, and WebDAV remains marked
deferred in source. This phase specifies the Gate B control-plane schema, feature gates, validation
guards, dev-only enablement, and failure taxonomy that MUST exist before any WebDAV execution path is
implemented.

## Context

- Phase 27 WebDAV / cloud / relay design audit committed: `08cf847`
  (`release-evidence/2026-06-25/labels-tags-categories-phase27-webdav-cloud-relay-design-audit.md`,
  `tools/validation/sync/validate-labels-tags-categories-phase27-webdav-cloud-relay-design-audit.mjs`).
- Phase 27 selected WebDAV as the single design candidate; WebDAV stays deferred in source.
- Current working transport remains local sync-folder JSON: `latest.json`, `chrome-latest.json`,
  receipts (inside `latest.json`), peer manifests/checksums/per-device state.
- Product metadata sync remains globally NOT READY.

## Required Design Decisions (locked for any later implementation)

- WebDAV transport carries the SAME envelopes unchanged: `latest.json`, `chrome-latest.json`, peer
  state / manifests, checksums. No envelope schema mutation.
- No new applied metadata request types (allowlist stays exactly four).
- No schema mutation of the metadata request/receipt/projection envelopes.
- No Chrome canonical mutation. Desktop remains canonical authority. WebDAV is DUMB TRANSPORT only.
- WebDAV writes require an explicit dev flag (no public/premium default enablement).
- Product metadata sync remains NOT READY globally (`productSyncReady: false`).
- No secrets/credentials in evidence. No raw chat titles/content/names/account-linked metadata in
  WebDAV diagnostics.

## 1. Transport Control-Plane Schema

Schema id: `h2o.studio.sync.webdav-transport-control-plane.v1` (specification only; not emitted by any
runtime path in this phase). The control plane is metadata-about-transport; it carries NO envelope
payload and NO secrets. Fields:

- `transportKind`: `'webdav'` (enum; `'local-folder'` is the default/fallback).
- `remoteRootRef`: an opaque, redacted reference to the remote root (e.g. a config key id +
  endpoint-host hash). The raw endpoint URL, username, password, or token are NEVER stored here and
  NEVER appear in evidence — only a `remoteRootRefHash` and a non-secret `remoteRootLabel`.
- `peerIdentity`: `{ peerIdHash, installIdHash, deviceLabel }` — hash/label only, no account identity.
- `safePeerDirectory`: a redacted per-peer directory descriptor `{ peerDirHash, schema, version }` —
  the directory layout under the remote root, hashed.
- `contentHash`: SHA-256 of the logical bundle content (the canonical projection + receipts payload).
- `fileHash`: SHA-256 of the exact transported file bytes (`latest.json` / `chrome-latest.json`).
- `sequenceNumber`: monotonically increasing per-peer export sequence.
- `previousExportId`: the prior `exportId` this bundle supersedes (chain link).
- `lastKnownRemoteState`: `{ exportId, sequenceNumber, fileHash, observedAtIso }` — last state the peer
  observed at the remote (counters/hashes only).
- `conflictStatus`: enum (see failure taxonomy) — `'none' | 'stale-remote' | 'sequence-regression' | 'peer-mismatch' | 'conflict-detected'`.
- `writeStatus`: enum — `'disabled' | 'skipped-no-dev-flag' | 'staged' | 'committed' | 'failed'`.
- `readStatus`: enum — `'disabled' | 'no-update' | 'imported' | 'rejected' | 'failed'`.
- `recoveryStatus`: enum — `'none' | 'recovery-required' | 'recovered-from-local' | 'recovered-from-remote'`.
- `privacyRedactionStatus`: `{ redacted: true, hashOnly: true, rawContent: false, rawTitles: false, rawNames: false, accountLinked: false, secretsPresent: false }`.

## 2. Feature Gating / Flags

All flags default to DISABLED. WebDAV is globally off unless every relevant gate is explicitly enabled
AND the dev flag is set. Specified flag keys (specification only):

- `h2o:studio:sync:webdav:enabled` — global master gate (default `false`).
- `h2o:studio:sync:webdav:read:enabled` — separate READ gate (default `false`).
- `h2o:studio:sync:webdav:write:enabled` — separate WRITE gate (default `false`).
- `h2o:studio:sync:webdav:desktop-export-mirror:enabled` — separate Desktop `latest.json` export
  mirror gate (default `false`).
- `h2o:studio:sync:webdav:chrome-request-export-mirror:enabled` — separate Chrome `chrome-latest.json`
  request export mirror gate (default `false`).
- `h2o:studio:sync:webdav:dev-flag` — must equal the explicit dev-only sentinel
  `'webdav-dev-only-do-not-ship'`; any other value (including unset) blocks all writes.

Gate rules:

- WebDAV globally disabled by default; no path runs unless `…:webdav:enabled === true`.
- Read and write are separate gates; enabling read never enables write.
- The Desktop export mirror and the Chrome request export mirror are separate gates; each must be
  enabled independently.
- Any write additionally requires `…:dev-flag === 'webdav-dev-only-do-not-ship'`.
- No public/premium default enablement: the flags are dev-only and ship `false`; no premium tier turns
  them on.
- Safe fallback: if any gate is off, config is missing/invalid, or any guard fails, the transport
  falls back to local sync-folder JSON (the current working transport) with no error to the user.

## 3. Validation Guards (must pass BEFORE any WebDAV execution path)

Each guard is a pre-execution assertion; failure → block + fall back to local. Specified guards:

- `envelope-unchanged-guard`: the bytes to be transported parse to the existing envelope schemas
  (`h2o.studio.library-metadata-mutation-request.v1`,
  `h2o.studio.library-metadata-mutation-receipt.v1`,
  `h2o.studio.library-metadata.desktop-canonical.v1`) with NO schema mutation; the file is carried
  byte-unchanged.
- `no-new-applied-type-guard`: the applied allowlist is exactly the four proven types; WebDAV adds none.
- `authority-guard`: Desktop remains canonical authority; Chrome remains request-only/read-only; the
  WebDAV layer performs no validation/apply/merge (dumb transport).
- `gate-guard`: the required gates are enabled and, for writes, the dev flag equals the sentinel.
- `privacy-guard`: the control plane + diagnostics contain no raw content/titles/names/account-linked
  metadata and no secrets/credentials.
- `integrity-guard`: `fileHash`/`contentHash` recomputed and matched; `sequenceNumber` monotonic;
  `peerIdHash` matches the expected peer directory; otherwise reject.

## 4. Dev-Only Enablement Requirements

- Writes require: master gate ON + write gate ON + the specific mirror gate ON + dev flag ==
  `'webdav-dev-only-do-not-ship'`.
- Reads require: master gate ON + read gate ON.
- The dev flag is never set in shipped/public/premium builds; it exists only for local developer
  proofs (Gate C).
- Credentials/endpoints are supplied via local developer config only, never committed, never in
  evidence, never logged.

## 5. Failure Taxonomy (WebDAV metadata transport)

Stable codes (specification only):

- `webdav-disabled`
- `webdav-missing-config`
- `webdav-invalid-config`
- `webdav-auth-failure`
- `webdav-permission-denied`
- `webdav-remote-unavailable`
- `webdav-timeout`
- `webdav-partial-upload`
- `webdav-checksum-mismatch`
- `webdav-stale-remote`
- `webdav-sequence-regression`
- `webdav-peer-mismatch`
- `webdav-schema-unsupported`
- `webdav-malformed-remote-file`
- `webdav-conflict-detected`
- `webdav-recovery-required`

Every failure code maps to the safe fallback (local sync-folder JSON) and is surfaced as a redacted
diagnostic (code + counters/hashes only). No failure path mutates Desktop canonical state.

## 6. Safety Constraints (envelopes unchanged)

- The transported files are byte-for-byte the existing `latest.json` / `chrome-latest.json`; WebDAV
  neither rewrites nor re-serializes the envelopes.
- Writers stage to a `.tmp` name and atomically rename (mirrors the existing `chrome-latest.json.tmp`
  staging); readers ignore `.tmp` files; partial uploads are never imported.
- The control plane is additive metadata stored OUTSIDE the envelopes; it never alters envelope schema
  or content.

## 7. Negative Gates (block implementation if violated)

A later implementation phase MUST be blocked if any of these is violated:

- envelope schema mutation (any change to the request/receipt/projection schemas) → BLOCK.
- new applied request type / any change to the applied allowlist → BLOCK.
- authority move (Chrome canonical mutation, Desktop authority moved off Desktop, or WebDAV doing
  validation/apply/merge) → BLOCK.
- write without the explicit dev flag, or any default/public/premium enablement → BLOCK.
- any secret/credential or raw chat title/content/name/account-linked metadata in evidence or
  diagnostics → BLOCK.
- any product-ready claim while transport is gated/unproven (`productSyncReady` must stay `false`) →
  BLOCK.

## Gate B Design Verdict

READY (design/spec only). The Gate B control-plane schema, feature gates (disabled-by-default,
separate read/write/desktop-export/chrome-request gates, dev-flag-required writes, safe local
fallback), validation guards, dev-only enablement, failure taxonomy, and negative gates are specified.
No WebDAV transport, no remote write, no schema mutation, no applied-type change, and no behavior
change were made. Implementation remains deferred behind these guards plus the Phase 27 Gate C
dev-only live proof.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. `productSyncReady` stays `false`. The Gate B spec does not
enable transport or change readiness; only the four applied types are runtime-proven and WebDAV stays
deferred.

## Recommended Phase 29

Phase 29: a DESIGN-ONLY Gate C dev-only live-proof PLAN for the WebDAV transport — specify the
dev-flag-gated proof steps (request → `.tmp` stage + atomic rename to remote → Desktop apply → receipt
→ remote → Chrome read-only import), the stale/duplicate/corrupt/partial-upload recovery cases to
exercise, and the redaction checks (no secret/endpoint/raw-data in captured artifacts) — still no
transport writes in CI, no allowlist change, no authority move, and `productSyncReady` stays `false`.
