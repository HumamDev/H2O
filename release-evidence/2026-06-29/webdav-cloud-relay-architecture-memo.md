# Architecture Memo — WebDAV / Cloud / Relay Transport for H2O / Cockpit Pro Sync

**Date:** 2026-06-29
**Status:** ARCHITECTURE-ONLY. No code, no product change, no implementation authorized.
**Scope:** Transport layer design for future multi-device sync. Builds on closed lanes: folder delete/restore lifecycle, Desktop-authoritative chat-folder binding lifecycle, full binding sync B1–B9 (closeout `416b556`, evidence `release-evidence/2026-06-25/chat-folder-binding-sync-closeout.md`).
**Explicitly out of scope:** Labels/tags/categories schema design (separate repo audit); any transport implementation.

---

## 1. Executive Verdict

**WebDAV / Cloud / Relay transport is NOT READY for product implementation.**

The blocker is not transport engineering — it is that **the full sync envelope/data model is not yet known**. Today's proven model covers exactly one entity class (chat-folder bindings) over a file-drop transport (`latest.json` / `chrome-latest.json`) between exactly two roles (one Desktop authority, one Chrome request-only client). Labels/tags/categories metadata sync is not yet audited or modeled. Multi-Desktop authority is undefined. There is no device identity, no logical clock, no integrity/encryption layer, and no transport-agnostic envelope.

Designing transport now, on paper, is correct and useful (this memo). **Building it now would harden the wrong envelope.** The recommended posture: complete the local metadata sync model first, then prototype WebDAV strictly read-only behind a flag.

What *is* ready: the **authority and safety invariants are sound and transport-independent** (Desktop canonical, Chrome request-only, no-delete family). They should be carried verbatim into any transport. The transport layer must be designed to *not weaken* them, which is the central design constraint below.

---

## 2. Assumptions

1. The proven wire today is `h2o.studio.fullBundle.v2` carrying `schemaVersion`, `exportId`, `sequenceNumber`, `sourcePeer`, and safety flags `noHardDelete` / `noPurge`, exchanged as whole-file drops (`latest.json`, `chrome-latest.json`) with all sync legs **OFF by default** and **no watcher/polling** anywhere (per the reopen audit, `release-evidence/2026-06-22/sync-architecture-reopen-audit.md`).
2. Desktop holds canonical state in SQLite (`folder_bindings`, folders) and projects it; Chrome never holds canonical authority and emits only request/receipt arrays (`chatFolderBindingRequests[]` → `chatFolderBindingReceipts[]`).
3. The current two-party topology is effectively single-writer. Multi-writer (two Desktops) is *not* a solved problem in any closed lane.
4. Chat content, snapshots, and assets are large/sensitive; binding/metadata is small. Transport cost and privacy profiles differ sharply between them.
5. Users will eventually want device-to-device sync without keeping both surfaces open simultaneously — i.e. transport must tolerate fully asynchronous, offline-first exchange.
6. WebDAV/cloud providers are **untrusted storage**: they can read, retain, index, reorder, partially deliver, and lose anything stored in plaintext.
7. The labels/tags/categories schema *will* change the envelope. This memo treats that schema as an unknown the transport must wait on, not design around.

---

## 3. Transport Role (Q1)

### What transport SHOULD do
- Move **opaque, self-describing envelopes** between devices' local stores. Transport is a **dumb pipe with integrity**: store, list, fetch, delete-own, that's it.
- Carry **all sync payload classes as envelopes**, but with class-specific handling rules (see below): canonical projections, request logs, receipts, tombstones, and device-state/heartbeat records.
- Provide **at-least-once delivery** with idempotent application on the receiver (dedupe by idempotency key).
- Preserve **ordering metadata** so the receiver can reconstruct causal order even if the transport delivers out of order.

### What transport must NEVER do
- **Never become an authority.** Transport never decides a conflict, never merges, never mutates canonical state, never derives a projection. It carries bytes; Desktop decides truth.
- **Never see plaintext** of anything above the minimum-privacy floor (see §7). The provider is untrusted.
- **Never delete canonical data.** Transport-level deletes are limited to a device pruning *its own* already-consumed envelopes; they must never translate into canonical chat/snapshot/asset/folder deletion. The `noHardDelete`/`noPurge`/`noChatDelete`/`noSnapshotDelete`/`noAssetDelete` invariants apply *through* transport unchanged.
- **Never grant Chrome canonical mutation.** Chrome over transport is still request-only.
- **Never trigger automatic apply on arrival without validation.** Arrival ≠ truth.

### What it should carry — recommendation
| Class | Carried? | Transport handling |
|---|---|---|
| Canonical projections | Yes | Read-model only on receiver; full-snapshot, content-hashed, last-writer-wins by authority |
| Request logs (Chrome-origin) | Yes | Append-only, idempotent, validated before apply |
| Receipts | Yes | Append-only, idempotent, dedup by request id |
| Tombstones | Yes | Soft-only; carry, never hard-delete on apply |
| Device state / heartbeat | Yes | Small, frequent, lowest-privacy-sensitivity; used for diagnostics + authority election |
| Chat content / snapshots / assets | **Deferred** | Heaviest + most sensitive; do NOT include in the first transport envelope. Bindings/metadata first. |

**Recommendation: carry all *metadata* classes; explicitly defer content/snapshots/assets to a later, separately-encrypted CAS-over-transport lane.**

---

## 4. Sync Envelope / Data Model (Q2)

A transport-agnostic envelope. The current `fullBundle.v2` is a starting point but is missing identity, clock, and integrity fields. Required fields:

```
envelope:
  schemaVersion        # existing — bump to v3 when transport identity/clock added
  envelopeId           # globally unique (UUID); idempotency key for the whole envelope
  producerDeviceId     # stable per-install device identity (new)
  userId / accountId   # logical owner identity, transport-independent (new)
  sourcePeer           # existing — 'desktop' | 'chrome'; role, not identity
  authorityRole        # 'canonical' | 'request' | 'receipt' | 'observer' (new, explicit)
  lamportClock         # monotonic logical clock per device (new)
  vectorClock{}        # optional: {deviceId: counter} for multi-Desktop causal ordering (new)
  sequenceNumber       # existing — per-producer monotonic; gap detection
  generatedAt          # wall-clock, advisory tiebreak only, NEVER primary ordering
  payloadClass         # 'projection' | 'request' | 'receipt' | 'tombstone' | 'deviceState'
  payloadHash          # content hash (e.g. SHA-256) over canonical-serialized payload (new)
  prevEnvelopeHash     # optional hash-chain link per producer for tamper/gap detection (new)
  idempotencyKey       # per-payload-item key (e.g. requestId) — dedupe on apply
  conflictMeta{}       # {basis: priorHash/seq the producer saw, expectedCurrentX} (new)
  safetyFlags{}        # existing — noHardDelete, noPurge, +noChatDelete/Snapshot/Asset
  payload{}            # the class-specific body (opaque/encrypted above privacy floor)
  sig                  # detached signature over header+payloadHash (new, see §7)
```

**Versioning.** Keep `schemaVersion` as the hard gate; bump to v3 for the transport-identity additions. Receivers must **reject-and-quarantine** unknown major versions, not best-effort parse. Forward-compat: unknown payload classes are stored and ignored, never dropped.

**Device identity.** New stable `producerDeviceId` minted at install, stored in OS keychain/secure storage. Distinct from `sourcePeer` (role) — two Desktops share role `desktop` but differ in `producerDeviceId`.

**User identity.** `userId`/`accountId` scopes a sync namespace. Until first-party accounts exist, derive a local pseudonymous account id from the key material so multi-device pairing works without a server.

**Monotonic / logical clock.** Wall clocks are untrustworthy across devices and offline gaps. Use a **Lamport clock per device** as the baseline, with an **optional vector clock** activated only when >1 canonical (Desktop) writer exists. `sequenceNumber` stays for cheap gap/loss detection per producer. `generatedAt` is advisory tiebreak only.

**Integrity.** `payloadHash` over a canonical serialization; optional `prevEnvelopeHash` hash-chain per producer to detect drops/reordering/tampering. This generalizes the content-hashing already used in the chat-saving lane.

**Idempotency.** Every applyable item carries a stable key (`requestId` already proven in B8/B9). Apply is dedup-on-key; replays are no-ops with a receipt.

**Causal ordering.** Receiver orders by (vectorClock dominance → Lamport → sequenceNumber → generatedAt). Concurrent (incomparable) envelopes are flagged as conflicts for resolution, never silently merged.

**Conflict metadata.** `conflictMeta.basis` records what the producer believed it was mutating from (e.g. B8's `expectedCurrentFolderId`). The canonical authority rejects/queues a request whose basis no longer matches — this is the proven optimistic-concurrency check, generalized.

---

## 5. Authority & Conflict Model (Q3, Q4)

### Authority (Q3)
- **Desktop remains the only canonical authority.** Transport changes the *medium*, not the *authority*. Bindings/metadata become canonical only when a Desktop applies them to SQLite and re-projects.
- **Relay can NEVER become authority.** A relay (even first-party) is storage + routing. It must be architecturally incapable of minting canonical state; otherwise the entire proven safety model collapses. This is a hard "do not implement."
- **Multiple Desktop instances** — the genuinely unsolved problem. Options, in order of preference:
  1. **Single-canonical-Desktop election** (recommended for v1 of any transport): exactly one Desktop holds the `canonical` lease at a time; others run as `observer` (read-model + request-only, like Chrome). A lease is a small device-state record in transport with TTL + heartbeat. This keeps the proven single-writer model intact over the wire.
  2. **Multi-canonical with vector clocks + merge** (deferred): only if/when the metadata model has well-defined commutative merge semantics. Not justified until the labels/tags schema is known.
- **Chrome-origin requests** flow unchanged: Chrome writes request envelopes → transport → the canonical Desktop validates against current state + `conflictMeta.basis` → applies or rejects → emits receipt envelope → transport → Chrome imports receipt + new projection → parity. Transport is invisible to this contract; it just replaces the file drop.

### Conflict handling (Q4)
| Scenario | Resolution |
|---|---|
| **Same chat moved on two devices** | If both are requests, the canonical Desktop serializes them by arrival; the second's `basis` no longer matches → rejected with a receipt explaining the stale basis; UI offers re-request. If two *canonical* Desktops, requires lease/election (above) — without it, this is unresolvable, which is exactly why multi-Desktop blocks transport. |
| **Folder deleted on one device while metadata changes elsewhere** | Delete is a **soft tombstone** (proven B6/B7). Concurrent metadata change applies to the chat; on tombstone apply, affected chats fall back to Unfiled, never deleted. Restore (B7) rebinds from recovery metadata. Tombstone + change are not a destructive conflict — they compose. |
| **Restore after delete** | Restore is itself a canonical mutation producing a new projection with higher clock; it supersedes the tombstone. Transport carries both; receiver orders by clock. No data loss (no-hard-delete invariant). |
| **Labels/tags/categories rename/delete/merge** | **OUT OF SCOPE — blocked.** These need the labels/tags/categories schema (separate audit) before conflict semantics can be defined. Transport must wait. Stated, not designed, here. |
| **Stale request replay** | Idempotency key dedupe + `basis` check: a replayed stale request is either a no-op (already applied → re-emit receipt) or rejected (basis moved). |
| **Duplicate receipts** | Dedupe by `requestId`; receipts are idempotent observations, applying one twice is a no-op. |
| **Out-of-order imports** | Logical clock + `sequenceNumber` gap detection: receiver buffers/reorders; strictly-older rows are skipped (already proven `skippedStale`); gaps trigger a re-fetch rather than apply. |

---

## 6. Offline / Idempotency Model (Q5)

- **Offline changes:** Desktop keeps applying locally to SQLite (it's the authority, fully functional offline). Outbound envelopes queue in a local durable outbox keyed by `envelopeId`. Chrome queues request envelopes in its local store.
- **Reconnect:** drain outbox in clock order; pull inbound envelopes since last consumed `sequenceNumber` per producer; reconcile. No focus/visibility dependency for transport (the focus-trigger fragility from the reopen audit must not be carried into transport — transport reconnect is an explicit, idempotent drain).
- **Retry / backoff:** at-least-once with exponential backoff + jitter, capped; idempotency keys make retries safe. Per-envelope retry budget; on exhaustion → quarantine + diagnostic, never silent drop.
- **Partial upload/download:** envelopes are atomic units. A partially-written envelope is detected by `payloadHash` mismatch and discarded/re-fetched. Never apply a partial envelope. (Whole-file-drop today already gives atomicity; transport must preserve it via temp-write+rename or multipart-with-manifest.)
- **Corrupt envelope recovery:** hash/sig failure → quarantine the envelope, surface a diagnostic, request re-send by `envelopeId`/`sequenceNumber`. Hash-chain (`prevEnvelopeHash`) lets the receiver detect exactly which producer envelope is missing/corrupt and request just that one.
- **Idempotency:** the whole model is apply-by-key. Replays, duplicate deliveries, and reconnect re-drains all converge to the same canonical state.

---

## 7. Security / Privacy Model (Q6)

**Threat model: the WebDAV/cloud provider is untrusted storage.** It must never see plaintext above the floor below.

- **Encryption:** end-to-end. Payloads encrypted client-side with a key the provider never holds (envelope-level authenticated encryption, e.g. per-payload symmetric key wrapped to device keys). Provider sees only ciphertext + minimal routing metadata (account namespace, opaque `envelopeId`, size, timestamps).
- **WebDAV provider must NOT see plaintext** of titles, folder names, labels, metadata, snapshots, or assets. This is non-negotiable for generic providers.
- **Minimum privacy floor (what must be encrypted):** chat **titles** (highly identifying), **folder names**, **labels/tags/categories** (when added), chat/snapshot **content**, and **assets** — all encrypted. Acceptable plaintext metadata: account namespace id, `envelopeId`, `sequenceNumber`/clock, size, timestamps, payload class. Even `sourcePeer`/`producerDeviceId` should be inside the encrypted header where possible; only what routing strictly needs stays clear.
- **Secret/key storage:** OS secure storage (macOS Keychain via Tauri) for device private keys + wrapped account key. Never in SQLite, never in synced files, never in the bundle.
- **Device trust model:** explicit pairing. A new device is enrolled by an existing trusted device (out-of-band code / QR), receiving the wrapped account key. Unenrolled devices cannot decrypt.
- **Revocation:** remove a device from the trust set + **rotate the account key** (re-wrap to remaining devices). Future envelopes use the new key; the revoked device retains only what it already decrypted (unavoidable) but gains nothing new.
- **Replay protection:** signed envelopes + monotonic clock/`sequenceNumber` + idempotency keys. A replayed old envelope is detected (seen key / lower clock) and ignored.
- **Tamper detection:** `payloadHash` + detached signature (`sig`) over header+hash, verified before apply. Optional `prevEnvelopeHash` chain detects truncation/reordering by the provider.
- **Authority + crypto interaction:** signature verifies *origin*; it does **not** confer canonical authority. A correctly-signed Chrome request is still request-only. Crypto and authority are orthogonal layers.

---

## 8. Transport Types — Tradeoffs (Q7)

| Transport | Pros | Cons / Risks | Verdict |
|---|---|---|---|
| **WebDAV** | User owns storage; no first-party server/cost/liability; maps cleanly to whole-envelope PUT/GET/PROPFIND/DELETE-own; works with Nextcloud/Fastmail/etc. | Provider untrusted → mandatory E2E encryption; weak/uneven listing & locking semantics; no push (poll only); auth/cred storage per provider; partial-write quirks. | **Recommended first transport** for a read-only prototype — lowest liability, exercises the full E2E envelope. |
| **Generic cloud file sync** (Dropbox/iCloud/Drive folder) | Zero protocol code (just a synced directory); user already has it; offline-first by nature. | No atomicity guarantees (sync-in-progress partials); conflict-copy files ("file (conflicted)"); opaque timing; provider sees plaintext unless encrypted; no real listing API. | **Viable fallback**, but treat exactly like WebDAV (untrusted, encrypted, hash-validated). Higher partial-write risk. |
| **First-party relay** | Push/real-time; clean APIs; central diagnostics; controlled rollout. | Server cost, ops, liability, **biggest "relay must never be authority" risk**; privacy/legal surface; auth system needed. | **Deferred.** Only after metadata model + multi-device authority are solved. Must be storage+routing only. |
| **Local LAN relay** (device-to-device on same network) | Lowest latency; no third party sees data; great for two of the user's own machines. | Discovery/pairing complexity; only works co-located; NAT/firewall; partial solution (doesn't cover "devices never online together"). | **Optional nice-to-have**, after WebDAV. Useful but not a primary transport. |

**Overall recommendation:** design one transport-agnostic envelope (§4); implement **WebDAV first, read-only, behind a flag**; treat generic cloud-folder as a near-identical sibling; defer first-party relay; consider LAN relay as a later optimization.

---

## 9. Operational Diagnostics (Q8)

Extend the existing **Folder Sync Health** concept (`sync/folder-import.mv3.js`) into a transport health surface.

- **Health states:** `Healthy` (drained, clocks aligned, parity green) · `Pending` (outbox/inbox queued, draining) · `Degraded` (retrying, backoff active, partial connectivity) · `Blocked` (auth failure, version mismatch, decrypt failure, unresolved conflict, multi-Desktop without lease) · `Quarantined` (corrupt/tampered envelope isolated).
- **Blockers vs warnings:** *Blockers* halt apply (decrypt fail, sig fail, unknown major version, stale-basis conflict, no canonical lease). *Warnings* are non-fatal (clock skew, large backlog, slow provider, near key-rotation).
- **User-facing recovery actions:** "Sync now" (manual drain), "Re-pair device", "Reconnect provider / re-auth", "Resolve conflict" (re-request), "Rotate key", "Clear quarantine & re-fetch". Each blocker maps to exactly one recovery action with plain-language cause (the reopen audit's "misleading success toast" lesson: never show success unless canonical state actually moved).
- **Developer diagnostics:** per-producer last `sequenceNumber` + gaps, clock vectors, outbox/inbox depth, last hash-chain verification, quarantine list with reasons, receipt round-trip latency, apply/reject/skip counts (mirror the B9 counters: `bindingRestoreAttemptedCount`, `applied`, `blockers[]`, `unfiledCount`, etc.).
- **Evidence needed before shipping (any transport leg):**
  1. Round-trip parity proof over transport equivalent to B1–B9 (projection → request → receipt → parity green).
  2. Idempotency proof: duplicate/replayed/out-of-order delivery converges, no double-apply.
  3. No-delete invariants hold across transport (chats/snapshots/assets/folders never hard-deleted via any envelope).
  4. Corrupt/tampered/partial envelope is quarantined, never applied.
  5. Offline→reconnect drain converges.
  6. E2E: provider-side bytes contain no plaintext above the privacy floor (inspect stored ciphertext).
  7. Multi-Desktop: either lease/election proven, or transport hard-gated to single canonical Desktop.

---

## 10. Sequencing Plan (Q9)

**Must be proven BEFORE any transport implementation:**
1. **Labels/tags/categories metadata sync audit + schema** (separate repo audit) — the envelope cannot be frozen without it. *Hard dependency.*
2. **Full local Desktop↔Chrome metadata sync model** known end-to-end (bindings ✅ closed; labels/tags/categories ⛔ pending).
3. **Multi-Desktop authority decision** (lease/election vs single-canonical gate).
4. **Device + user identity + key model** defined (even if locally-pseudonymous first).

**Local lanes that must close first:**
- Bindings B1–B9 — ✅ closed (`416b556`).
- Labels/tags/categories sync — ⛔ must close.
- Any remaining library/parity lanes touched by the metadata model.

**First safe prototype boundary (when unblocked):**
- **WebDAV, read-only, flag-gated, off by default.** Desktop *uploads* signed+encrypted projection envelopes; a second device *downloads + verifies + renders read-model only* — **no apply, no canonical mutation over transport** in the first prototype. This mirrors B1–B4 (read-only projection lane) but over the wire.
- Then, and only then, add request/receipt apply over transport (mirroring B8–B9) behind a second flag.

**What must remain read-only initially:** all canonical mutation. Transport's first job is to move projections one-way and prove integrity/privacy/idempotency without touching authority.

**What must be behind flags:** every transport leg, independently, default OFF (carry forward the proven "all legs opt-in, OFF by default, no watcher/polling" posture). A master "Premium Sync" switch may group them, but each leg stays individually gated for safe rollback.

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Envelope frozen before labels/tags schema → costly rework / data migration | High | Hard-block transport on the metadata audit; version the envelope; reject-unknown-major. |
| Relay/transport drifts into becoming authority | Critical | Architectural invariant: transport carries bytes only; canonical state only from Desktop SQLite apply. Lease, not write, for multi-Desktop. |
| Untrusted provider reads private data | Critical | Mandatory E2E encryption above the privacy floor; verify ciphertext-only on provider before ship. |
| Partial/corrupt/tampered envelope applied | High | Atomic envelopes, `payloadHash` + sig verify-before-apply, quarantine, hash-chain gap detection. |
| Multi-Desktop concurrent canonical writes corrupt state | High | Single-canonical lease/election for v1; defer multi-canonical merge until commutative semantics exist. |
| Stale request replay re-moves a chat | Medium | Idempotency keys + `conflictMeta.basis` check (proven B8/B9). |
| Focus/visibility trigger fragility carried into transport | Medium | Transport drain is explicit + idempotent, not focus-coupled; reuse the boot-race lessons. |
| Key loss / device compromise | High | Keychain storage, explicit pairing, revocation + key rotation, re-wrap to survivors. |
| Misleading "synced" UI when canonical didn't move | Medium | Health surface shows success only on confirmed canonical/parity change (reopen-audit lesson). |

---

## 12. Explicit "Do NOT Implement Yet" List

1. **Do not** start any WebDAV / cloud / relay transport implementation.
2. **Do not** freeze or extend the sync envelope schema for transport until the labels/tags/categories schema is known.
3. **Do not** design or implement the labels/tags/categories schema here (separate audit owns it).
4. **Do not** build a first-party relay, or any relay that can mint/merge canonical state.
5. **Do not** enable any multi-writer / multi-canonical-Desktop merge. No lease/election code yet either — design only.
6. **Do not** grant Chrome (or any non-Desktop surface) canonical mutation over transport. Request-only stands.
7. **Do not** transport chat content / snapshots / assets in the first envelope; metadata first, content later under its own encrypted CAS lane.
8. **Do not** add file watchers / polling / focus-coupled auto-apply as part of transport.
9. **Do not** weaken any safety invariant: `noHardDelete`, `noPurge`, `noChatDelete`, `noSnapshotDelete`, `noAssetDelete` apply through transport unchanged.
10. **Do not** store any plaintext above the privacy floor with any provider, or any key material in synced files.

---

## 13. Final Recommendation

**NOT READY for product implementation.**

- ✅ **Ready now:** the authority model, safety invariants, and conflict primitives (soft tombstone, optimistic `basis` check, idempotent request/receipt, last-writer-wins-by-authority) are sound and transport-portable. This memo's envelope and security model are a usable design target.
- ⛔ **Blocking:** (1) labels/tags/categories metadata audit + schema; (2) full local metadata sync model closed; (3) multi-Desktop authority decision; (4) device/user identity + key model.
- ➡️ **Next step when unblocked:** WebDAV, read-only, one-way projection, flag-gated, default OFF — the over-the-wire analogue of binding-sync B1–B4 — with the seven evidence gates in §9 required before any apply-over-transport (B8–B9 analogue) is attempted.

Transport design may continue **on paper, read-only**, in parallel with the metadata audit. Transport *code* waits until the envelope is fully known.
