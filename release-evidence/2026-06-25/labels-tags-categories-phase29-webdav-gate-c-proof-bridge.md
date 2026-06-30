# Labels / Tags / Categories / Classification Metadata Sync

## Phase 29 WebDAV Gate C — Design-to-Proof Bridge (live-proof plan)

Date: 2026-06-29

## Status

DESIGN / PROOF-PLAN ONLY. No WebDAV transport was implemented. No WebDAV writes are enabled. No remote
files are written. No source modules were modified. No runtime behavior changed. No fifth request type
was added. The applied metadata request allowlist is unchanged at exactly four types, and WebDAV
remains marked deferred in source. This phase specifies the Gate C end-to-end live-proof plan, the
control-plane manifest proof, and the guard-matrix proof that must pass before any WebDAV transport
writes are enabled in a later Phase 30 dev-flagged prototype.

## Context

- Phase 28 WebDAV Gate B schema/guard specification committed: `3654291`
  (`release-evidence/2026-06-25/labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec.md`,
  `tools/validation/sync/validate-labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec.mjs`).
- Phase 28 defined the control-plane schema `h2o.studio.sync.webdav-transport-control-plane.v1`,
  disabled-by-default feature gates, read/write separation, the dev-only write flag, the failure
  taxonomy, and the pre-execution validation guards.
- Phase 27 selected WebDAV as the single design candidate; WebDAV stays deferred in source.
- Current working transport remains local sync-folder JSON only.
- Product metadata sync remains globally NOT READY.

## Locked Invariants

- Applied request types remain exactly: `chat-category-assign`, `chat-category-clear`,
  `chat-label-bind`, `chat-tag-bind`.
- WebDAV carries the SAME envelopes unchanged (`chrome-latest.json`, `latest.json`); no schema
  mutation; no new applied request types.
- Desktop remains canonical authority; Chrome remains request-only/read-only; WebDAV is dumb transport.
- `productSyncReady` stays `false`.

## 1. Gate C Live-Proof Plan (WebDAV transport)

Gate C is the dev-only, dev-flagged end-to-end live proof. Phase 29 specifies it; it is executed only
when Phase 30 implements the dev-flagged prototype. The proof runs against a developer-supplied remote
endpoint with test credentials (local config only, never committed/logged/in-evidence), behind the
Phase 28 gates (`…:webdav:enabled`, separate read/write/mirror gates, and the
`…:dev-flag === 'webdav-dev-only-do-not-ship'` write flag). With the gates off (the default and the
state in CI), the proof is a no-op that falls back to local sync-folder JSON.

## 2. End-to-End Proof Sequence (no transport writes enabled in CI)

The proof must demonstrate, in order:

1. Chrome request export envelope remains unchanged (byte-equal to the local `chrome-latest.json`).
2. WebDAV mirror carries a byte-equivalent `chrome-latest.json` (content hash + file hash match local).
3. Desktop imports the same request envelope (same `requestId`/`idempotencyKey`).
4. Desktop applies only one of the four allowed request types (apply gate unchanged).
5. Desktop emits the receipt and the canonical projection.
6. WebDAV mirror carries a byte-equivalent `latest.json` (content hash + file hash match local).
7. Chrome imports the receipt + projection read-only (no Chrome canonical mutation).
8. Duplicate/replay resolves as `skipped_duplicate`.
9. Stale basis resolves safely (`stale_basis`).
10. Corrupt remote file is rejected (`webdav-checksum-mismatch` / `webdav-malformed-remote-file`).
11. Partial upload is rejected or recovered via `.tmp` staging + atomic rename
    (`webdav-partial-upload`).
12. Sequence regression is rejected (`webdav-sequence-regression`).
13. Peer mismatch is rejected (`webdav-peer-mismatch`).
14. Missing remote state falls back safely to local sync-folder JSON (`webdav-stale-remote` /
    `webdav-remote-unavailable` → local fallback).
15. No raw secrets, endpoints, chat titles, content, label names, tag names, category names, or
    account-linked data appear in evidence.

Each step is byte/hardware-agnostic: ordering relies on sequence numbers and content/file hashes, not
wall-clock timestamps.

## 3. Control-Plane Manifest Proof

The proof must emit a `h2o.studio.sync.webdav-transport-control-plane.v1` manifest carrying ONLY
metadata-about-transport (no envelope payload, no secrets), and assert each field is present and
redacted/hash-only:

- `transportKind` (`'webdav'`)
- `schemaVersion`
- redacted remote root reference (`remoteRootRef` — `remoteRootRefHash` + non-secret label only)
- `safePeerDirectory` (`peerDirHash`)
- peer identity hash / redacted peer id (`peerIdentity.peerIdHash`)
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

## 4. Guard Matrix Proof

The proof must exercise and pass every guard; any failure blocks transport and falls back to local:

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

## 5. Redaction / Privacy Proof

- The captured evidence (manifest, diagnostics, logs) must contain NO raw secrets, endpoints,
  credentials/tokens, chat titles, chat content, label names, tag names, category names, or
  account-linked data.
- The proof asserts redaction positively: scan all captured artifacts for known seeded sentinels and
  assert none appear; assert `privacyRedactionStatus` reports `redacted: true`, `hashOnly: true`,
  `secretsPresent: false`.
- Endpoints/credentials are referenced only by hash/label; the raw values live in local dev config
  and never enter evidence.

## 6. Failure / Recovery Proof

The proof must drive each failure path and assert safe resolution:

- corrupt remote file → reject, keep last-known-good local, surface redacted `webdav-checksum-mismatch`.
- partial upload → `.tmp` staging + atomic rename means readers never import a partial; assert
  `webdav-partial-upload` is surfaced and no partial is applied.
- stale remote / sequence regression / peer mismatch → reject, keep canonical state, fall back to
  local.
- remote unavailable / timeout / auth failure / permission denied → fall back to local sync-folder
  JSON with no user-facing error and no canonical mutation.
- recovery required → Desktop re-exports the current canonical projection as the source of truth; no
  remote state can regress Desktop canonical.

## 7. Required Runtime Evidence Capture Points (for the later dev-only implementation)

When Phase 30 runs the proof, it must capture (redacted) at each point:

- Chrome request export: `requestId`/`idempotencyKey` (hash), request type, `contentHash`/`fileHash`,
  gate state.
- WebDAV request mirror write: `writeStatus`, `sequenceNumber`, `fileHash`, manifest.
- Desktop import + apply: applied type (one of four), receipt status, before/after projection
  count/hash.
- WebDAV projection mirror write: `writeStatus`, `fileHash`, manifest.
- Chrome read-only import: `readStatus`, imported counts/hash (read-only), `noChromeCanonicalMutation`.
- Replay/stale/corrupt/partial/sequence/peer/missing cases: the resolved failure code + recovery
  status.
- A final redaction scan asserting no sentinel/secret/raw-data leaked.

## 8. Entry Conditions for a Later Phase 30 Dev-Flagged Prototype

Phase 30 may implement a dev-flagged WebDAV prototype ONLY when ALL of these hold:

- This Gate C plan (Phase 29) is approved and committed.
- The Phase 28 Gate B guards + feature gates + failure taxonomy are implemented behind the
  disabled-by-default flags, with the dev-only write flag required for any write.
- The applied allowlist is still exactly the four proven types; WebDAV adds none.
- The envelopes are carried byte-unchanged; no schema mutation.
- Desktop-canonical / Chrome-request-only / dumb-transport authority is preserved.
- All writes are gated behind `…:dev-flag === 'webdav-dev-only-do-not-ship'`; no public/premium
  default; safe fallback to local.
- The redaction proof can run and assert no secret/raw-data in evidence.
- `productSyncReady` stays `false`; no product-ready claim.

If any entry condition fails, Phase 30 does not proceed.

## Gate C Proof-Bridge Verdict

READY (design/proof-plan only). The Gate C live-proof plan, control-plane manifest proof, guard-matrix
proof, redaction/privacy proof, failure/recovery proof, runtime evidence capture points, and Phase 30
entry conditions are specified. No WebDAV transport, no WebDAV write, no remote file, no schema
mutation, no applied-type change, and no behavior change were made.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. `productSyncReady` stays `false`. The Gate C proof plan
enables no transport and changes no readiness; only the four applied types are runtime-proven and
WebDAV stays deferred.

## Recommended Phase 30

Phase 30: implement the dev-flagged WebDAV prototype behind the Phase 28 gates and execute this Gate C
proof — only if every entry condition in §8 holds — capturing redacted evidence per §7. The prototype
must keep the applied allowlist at exactly four, carry envelopes byte-unchanged, preserve
Desktop-canonical / Chrome-read-only authority, require the dev-only write flag, fall back safely to
local, and keep `productSyncReady` false. No public/premium enablement.
