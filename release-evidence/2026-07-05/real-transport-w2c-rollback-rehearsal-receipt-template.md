# Real Transport W2c Rollback Rehearsal Receipt Template

Status: template only; not live approval; not W2c PASS.

Anchors:
- W2b loader registration: e3217aac1af7fe2e1d46fe86ea0025f197565d80
- W2a first-write preflight substrate: b08bb910791bdfd89c8a823da8987154787fd0d2

Purpose:
This template prepares the hash-only rollback rehearsal receipt required before a future W2c first-write preflight proof can be attempted. Filling this template does not generate a W2 receipt, does not mint a token, does not authorize W3, and does not execute transport.

Required hash-only fields to fill later:
- killSwitchEnableTokenHash: sha256:<kill-switch-enable-token-hash>
- disableRehearsalReceiptHash: sha256:<disable-rehearsal-receipt-hash-placeholder>
- b2KillSwitchRefHash: sha256:<kill-switch-ref-hash>
- rollbackRehearsalReceiptHash: sha256:<rollback-rehearsal-receipt-hash>
- w2aPreflightRefHash: sha256:<w2a-preflight-ref-hash>

Required rehearsal proof fields to fill later:
- disableBlocksPreflight: true.
- disableBlocksApply: true.
- missingDisableReceiptBlocks: true.
- staleDisableReceiptBlocks: true.
- noWriteEnqueueStoreLedgerExportMutationOccurred: true.
- realWriteExecuted: false.
- writesWebDAV: false.
- writesCloud: false.
- writesRelay: false.
- writesCAS: false.
- writesFiles: false.
- enqueuesRelay: false.
- durableStoreCreated: false.
- relayOutboxTouched: false.
- publicationLedgerTouched: false.
- mutatesExportState: false.
- mintsExportId: false.
- burnsSequence: false.
- productSyncReady: false.
- transportReady: false.

Forbidden in the filled artifact:
- productSyncReady:true is forbidden.
- transportReady:true is forbidden.
- realWebDAVTransportAvailable:true is forbidden.
- standingAuthority:true is forbidden.
- oneShotTokenMinted:true is forbidden.
- writesWebDAV:true is forbidden.
- enqueuesRelay:true is forbidden.
- fullBundleV3Started:true is forbidden.
- mintsExportId:true is forbidden.
- burnsSequence:true is forbidden.
- raw endpoint URL values are forbidden.
- raw credentials are forbidden.
- raw remote paths are forbidden.
- payload bodies are forbidden.
- CAS keys are forbidden.
- fullBundle.v3 start remains forbidden.
- a950 mutation authority is forbidden.
- Chat Saving CAS start or write authority is forbidden.

Boundary statement:
This template is not a live approval, not a W2c PASS, not a receipt, and not real write authority.
