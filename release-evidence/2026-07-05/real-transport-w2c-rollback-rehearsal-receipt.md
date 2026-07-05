# Real Transport W2c Rollback Rehearsal Receipt

Status: prepared operator artifact with pending hash bindings; not W2c live proof; not W2c PASS.

Anchors:
- W2c operator artifact prep/templates: ab82ba706d234ad1acf97810ed0deafb76436e78
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Artifact fields:
- killSwitchEnableTokenHash: PENDING_OPERATOR_HASH:killSwitchEnableTokenHash
- disableRehearsalReceiptHash: PENDING_OPERATOR_HASH:disableRehearsalReceiptHash
- rollbackRehearsalReceiptHash: PENDING_OPERATOR_HASH:rollbackRehearsalReceiptHash
- b2KillSwitchRefHash: PENDING_OPERATOR_HASH:b2KillSwitchRefHash
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
- W2c live proof remains blocked until every PENDING_OPERATOR_HASH field is replaced by a real sha256:<64hex> value.
