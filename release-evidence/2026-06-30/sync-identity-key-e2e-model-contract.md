IDENTITY + KEY + E2E ENCRYPTION MODEL — DESIGN ONLY, NOT IMPLEMENTED

Date: 2026-06-30

Scope:

- Sync-lane design contract for device/user identity and key/E2E encryption.
- Blocks WebDAV metadata transport and archive package CAS sync until implemented.
- Does not implement runtime code, crypto, keychain storage, pairing UI, transport, archive package sync, or metadata envelope freeze.

Investigation summary:

- Existing F2 peer identity doc defines:
  - `installId`
  - `physicalDeviceId`
  - `syncPeerId = <surface>:<app>:<store>:<installId>`
  - public API: `H2O.Studio.identity`
- Existing F3 envelope stamping uses:
  - `sourceSyncPeerId`
  - `sourceSurfaceKind`
  - `sourceAppKind`
  - `sourceStoreKind`
  - `exportSchemaVersion`
- Existing sync code and validators use `peerId`, `peerIdHash`, `syncPeerId`, `syncPeerIdHash`, `remote_sync_peer_id`, `deleted_by_sync_peer_id`, `restored_by_sync_peer_id`, and related DB/envelope names.
- Existing F14 sync kernel identity kit provides canonical JSON, SHA-256 helpers, UUID helpers, identity validation, subject IDs, dedupe keys, and lineage IDs.
- Existing crypto usage is hash/UUID/integrity-oriented (`crypto.subtle.digest`, `crypto.randomUUID`, `crypto.getRandomValues`), not a keychain-backed E2E encryption model.
- The 2026-06-29 WebDAV / Cloud / Relay Transport memo explicitly requires:
  - metadata first, content later
  - WebDAV/cloud provider treated as untrusted storage
  - E2E encryption above the privacy floor
  - explicit pairing
  - device revocation plus key rotation
  - OS secure storage for device private keys and wrapped account key
  - no chat content/snapshots/assets in the first transport envelope
- No current archive package cloud sync implementation exists. L.0 and L.1 keep `.h2ochat` package sync deferred to encrypted CAS-over-transport.

Current identity vocabulary:

- `installId`
  - Current F2 sensitive per-install UUID.
  - Local install identity anchor.
  - Loss of `installId` means the surface becomes a new peer.
  - Must not be shown in normal UI and must not be treated as a cryptographic key.
- `syncPeerId`
  - Current F2 derived sync peer identity: `<surface>:<app>:<store>:<installId>`.
  - Used by current metadata export/import, tombstone attribution, conflict audit, and peer-aware sync logic.
  - Can be hashed as `syncPeerIdHash` for lower-disclosure records.
- `peerId`
  - Existing shorthand used in several sync modules for peer identity fields.
  - May mean raw `syncPeerId`, hashed `syncPeerId`, or a per-table peer key depending on the module.
  - Future contracts must avoid introducing a second ambiguous `peerId`; use explicit names such as `syncPeerId`, `syncPeerIdHash`, `producerDeviceId`, and `recipientDeviceKeyId`.
- `sync_peer_id`
  - Storage/envelope column naming convention for peer identity references.
  - Not a separate identity source.
  - Must remain a reference to the normalized sync peer identity or its documented hash form.

Device identity contract:

- Local install identity:
  - `installId` remains the current stable per-install identity anchor for local sync identity.
  - `syncPeerId` remains the current protocol peer identifier for metadata lanes that already use F2/F3.
- Future signed publication identity:
  - Introduce `producerDeviceId` only in the future encrypted transport envelope.
  - `producerDeviceId` should be derived from or bound to the device signing public key, not from plaintext `installId` alone.
  - `producerDeviceId` identifies the publishing device for signature/authenticity verification.
  - It should live in the encrypted header where possible; only routing-minimal identity stays clear.
- Future encryption recipient identity:
  - Introduce `recipientDeviceKeyId` or equivalent key fingerprint for each trusted device encryption public key.
  - Recipients are trusted devices, not surfaces, folders, packages, or WebDAV accounts.
  - Encryption recipients must be selected from the trusted device set.
- Mapping:
  - `installId` maps one local install to local peer state.
  - `syncPeerId` maps that install to metadata sync attribution.
  - `producerDeviceId` maps signed publications to a trusted device key.
  - `recipientDeviceKeyId` maps encrypted payload access to device public keys.
  - These mappings must be persisted only after explicit pairing/trust and must not be inferred from WebDAV files.

User identity and pairing/trust:

- A user sync namespace may start as local/pseudonymous.
- Full first-party account identity is not required for the first design, but the design must allow later account binding.
- `userId` / `accountId` in transport is a logical namespace, not authority.
- Devices are grouped by a trusted device set under that user namespace.
- New device enrollment requires explicit pairing:
  - initiated by an existing trusted device
  - confirmed by out-of-band code, QR, or equivalent human-verifiable ceremony
  - results in device public key enrollment and account/content key wrapping for the new device
- Unpaired devices can see only clear routing metadata and ciphertext.
- Device revocation:
  - removes the device from the trusted device set
  - rotates content/account keys
  - re-wraps new keys only to remaining trusted devices
  - cannot revoke data the removed device already decrypted
- Trust decisions are local/user decisions, not WebDAV/cloud provider decisions.

Key model:

- Each trusted device has at least:
  - signing keypair for authenticity
  - encryption keypair or key-agreement keypair for payload key wrapping
- Private keys are stored in OS secure storage:
  - macOS Keychain for Desktop/Tauri
  - SecureStore/Keychain equivalent for mobile later
  - browser storage only after explicit risk acceptance and likely only for request/status-limited Chrome roles
- Keys are never stored in synced files.
- Keys are never stored in plaintext SQLite.
- Keys are never stored in `.h2ochat` packages.
- Keys are never shipped in the bundle.
- Per-payload content-encryption key:
  - randomly generated per envelope/blob
  - used for authenticated encryption of payload
  - wrapped to each trusted recipient device public key
- Rotation:
  - rotate account/content wrapping keys on revocation, compromise, or operator request
  - future envelopes use the new key epoch
  - old envelopes remain readable only to devices that still possess old keys unless rewrapped by policy
- Re-wrap:
  - re-wrap keys to surviving trusted devices after revocation
  - record key epoch and trusted device set version in encrypted metadata
- Recovery limitation:
  - if all trusted private keys are lost and no recovery key exists, encrypted cloud data is unrecoverable
  - any recovery key must be explicit, separately protected, and not silently uploaded

E2E encryption substrate:

- Provider sees ciphertext only above the privacy floor.
- Encrypt above the privacy floor for:
  - chat titles
  - folder names
  - labels/tags/categories
  - chat content
  - snapshots
  - assets
  - `.h2ochat` package bodies
- Clear routing metadata must be minimal:
  - account namespace id or opaque namespace id
  - envelope/blob id
  - payload class
  - sequence/clock needed for retrieval
  - size and timestamps where unavoidable
- Encryption is transport-agnostic:
  - metadata envelopes now/later
  - future `.h2ochat.enc` immutable CAS blobs later
  - WebDAV, cloud folder, relay, or LAN transport all carry the same encrypted envelope/blob model
- Integrity/authenticity fields:
  - `payloadHash` over canonical plaintext payload before encryption or over canonical encrypted payload, with scope fixed by future envelope contract
  - detached signature or authenticity proof over protected header plus payload hash
  - `prevEnvelopeHash` / hash-chain where sequence gap or truncation detection matters
  - per-producer `sequenceNumber` and logical clock for gap/replay detection
- Verify-before-use:
  - decrypt only after recipient authorization and wrapper verification
  - verify signature/origin
  - verify payload hash
  - verify sequence/hash-chain where present
  - quarantine on mismatch, unknown major version, decryption failure, signature failure, or hash-chain gap
- Archive package CAS compatibility:
  - future remote CAS blob path: `cas/<contentHash>.h2ochat.enc`
  - `contentHash` remains package identity for the plaintext verified package projection
  - encrypted blob also needs ciphertext hash/integrity metadata for transport corruption checks
  - package must still pass `inspectPackage` before operator apply after decryption

Invariants inherited from WebDAV/cloud memo:

- Transport is never authority.
- Desktop remains canonical.
- Chrome remains request-only and has no package-body authority.
- All sync/cloud legs are flag-gated OFF by default.
- No watcher/polling/focus-coupled sync.
- No plaintext package bytes in cloud.
- No package auto-apply.
- No automatic undelete or tombstone supersession.
- Signed/encrypted origin does not confer canonical authority.
- A correctly signed Chrome request remains a request.
- Arrival over transport is not truth.

Sequencing:

- This identity/key model is a hard prerequisite for WebDAV metadata transport.
- This identity/key model is a hard prerequisite for archive package CAS sync L.2.
- This model can be designed in parallel with metadata envelope closure.
- This model must not freeze the metadata envelope.
- This model must not implement transport.
- This model must not implement archive package sync.
- Multi-Desktop authority decision follows identity/key model and metadata envelope progress.

Design-only boundaries:

- Do not implement crypto.
- Do not implement keychain storage.
- Do not implement pairing UI.
- Do not implement WebDAV.
- Do not freeze metadata envelope.
- Do not implement archive package sync.
- Do not modify archive restore/relink/import/export/inspector runtime.
- Do not modify scanner/materializer/writer runtime.
- Do not modify capabilities.
- Do not touch Chrome runtime/service-worker.
- Do not touch sync/appearance/ribbon dirty files.
- Do not touch or pop stash@{0}.
- Do not touch f17 migration drift.

Recommended follow-up:

- Create a Sync-lane static validator that locks the design-only boundary:
  - no keychain/E2E runtime implemented yet
  - no package bytes over cloud
  - no transport envelope freeze
  - existing `installId` / `syncPeerId` identity remains current metadata identity
  - future `producerDeviceId` / recipient key IDs remain design-only until pairing/key storage lands
