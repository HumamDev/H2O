# Real Transport W2c Rollback Rehearsal Receipt

Status: hash-bound operator artifact ready for W2c live proof; not W2c live proof; not W2c PASS.

Anchors:
- W2c operator artifact prep/templates: ab82ba706d234ad1acf97810ed0deafb76436e78
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Artifact fields:
- killSwitchEnableTokenHash: sha256:1bc1347ee09500a6fe2650758c6ecf5fb3e6cf66220feca53bc9d5240308f02d
- disableRehearsalReceiptHash: sha256:4b8da2a109bc823edad52b1dd8360e436efed845960583124d001861ea28a498
- rollbackRehearsalReceiptHash: sha256:dc8a3a088d61f7d4b537d41810f9ab6116c834bde9cb86fa111d077c70aabb3b
- b2KillSwitchRefHash: sha256:89912f3960b373ef42ab16d719028ed2384b3eaa6a8311e7145f7273c8353705
- disableBlocksPreflight: true
- disableBlocksApply: true
- missingDisableReceiptBlocks: true
- staleDisableReceiptBlocks: true
- noWriteEnqueueStoreLedgerExportMutationOccurred: true
- realWriteExecuted: false
- writesWebDAV: false
- writesCloud: false
- writesRelay: false
- writesCAS: false
- writesFiles: false
- enqueuesRelay: false
- durableStoreCreated: false
- relayOutboxTouched: false
- publicationLedgerTouched: false
- mutatesExportState: false
- mintsExportId: false
- burnsSequence: false
- productSyncReady: false
- transportReady: false

Boundary assertions:
- Disable rehearsal must prove that disable blocks preflight before any write authority is modeled.
- Disable rehearsal must prove no write, enqueue, store, ledger, or export mutation occurred.
- This artifact is hash-only and contains no raw endpoint URL.
- This artifact contains no raw credential.
- This artifact contains no raw remote path.
- This artifact contains no payload body.
- This artifact contains no CAS key.
- fullBundle.v3 is not started or minted.
- a950 mutation is not authorized.
- Chat Saving CAS remains separate and blocked.
- No standing authority is created.
- No one-shot token is minted.
- No W2 receipt was generated.
- W2c live proof remains blocked until the separate live proof slice runs.
- W3 remains blocked pending W2c live proof and later red-team review.

Repo-safe bindings:
- The B2 kill-switch reference value is the sha256 digest of the committed B2 implementation evidence file.
- Private bindings:
- The kill-switch enable reference, disable rehearsal receipt, and rollback rehearsal receipt values were copied only as sha256:<64hex> digests from local private redacted artifacts.
- Private JSON artifacts were not copied into the repo.
