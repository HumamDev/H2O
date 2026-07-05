# Operational.5 - Global Readiness Policy Fork After a950

Verdict: **POLICY OPTION 2 SELECTED - KEEP `productSyncReady:false`, PRESERVE `localExportableSyncReady:true`, AND ALLOW ONLY A SEPARATE TRANSPORT-READINESS EVALUATION CANDIDATE STATE**.

This is an evidence/policy-only slice. It does not mutate product source, does not clean or mutate
`row:a950a44b859f`, does not delete or mutate folders, chats, bindings, tombstones, ledgers, receipts,
import/export state, or the render mirror, does not flip `productSyncReady`, does not start
WebDAV/cloud/relay/`fullBundle.v3`, and does not touch Chat Saving WebDAV/cloud/archive CAS.

## Source Chain Respected

- a950 read-only investigation: `baa7718d`.
- final Operational.5 rollup: `16853425`.
- localExportableSyncReady live closeout: `82cf4aba`.
- localExportableSyncReady implementation: `9d317664111a8c18e61d237f7aba8a96b86cb723`.
- a950 documented-debt policy: `684ea497522b1804beb04fc3de0f5672b6901356`.

## Current Facts

- `row:fdd2456fc8a2` was cleaned exactly once.
- `row:a950a44b859f` remains permanent documented, quarantined debt.
- a950 has no new strict tombstone evidence.
- a950 cleanup remains blocked and source-enforced.
- raw canonical bindings: `13`.
- exportable canonical bindings: `12`.
- `fullBundle.v2` bindings: `12`.
- undocumented dangling rows: `0`.
- exportable dangling bindings: `0`.
- `localExportableSyncReady:true`.
- global `productSyncReady:false`.
- `transportReady:false`.
- WebDAV/cloud/relay/`fullBundle.v3` blocked/not-started.
- Chat Saving WebDAV/cloud/archive CAS blocked/deferred.

## Options Evaluated

### Option 1 - keep everything blocked until raw canonical debt is fully resolved

Rejected as too conservative for planning. This option correctly preserves global `productSyncReady:false`, but it also
blocks the next read-only transport-readiness evaluation even though exportable local parity is clean and a950 is
quarantined from export. It would prevent useful evaluation work that does not write or start transport.

### Option 2 - keep `productSyncReady:false`, but allow a separate transport-candidate policy state

Selected. Recommended state name:

- `transportEligibilityFromLocalExportableReady:true`

Rejected alternate:

- `transportCandidateWithQuarantinedLocalDebt:true` - accurate, but less clear that it is only eligibility for the next
  evaluation and not transport authorization.

This selected state is policy-only for now. It may authorize only the next **separate transport-readiness evaluation**
slice. It must not start WebDAV/cloud/relay/`fullBundle.v3`, must not flip `productSyncReady`, must not touch Chat Saving
CAS, must not clean a950, and must not mutate product state.

### Option 3 - flip `productSyncReady:true` despite a950 debt

Rejected. Global `productSyncReady` remains authoritative and cannot flip while `row:a950a44b859f` remains documented
raw canonical debt. Documented debt is not a global readiness exception.

## Selected Policy Semantics

`localExportableSyncReady:true` means:

- exportable local canonical parity is clean;
- exportable canonical bindings match `fullBundle.v2`;
- exportable dangling bindings are absent;
- undocumented dangling rows are absent;
- remaining raw canonical debt is documented, visible, and quarantined;
- a950 remains documented debt and is not hidden.

`localExportableSyncReady:true` is **not**:

- global product readiness;
- transport readiness;
- WebDAV/cloud/relay authorization;
- `fullBundle.v3` authorization;
- Chat Saving CAS authorization;
- cleanup authorization;
- permission to weaken strict tombstone cleanup rules.

`transportEligibilityFromLocalExportableReady:true` may be used in a future evidence/source slice only when:

1. `localExportableSyncReady:true`;
2. `productSyncReady:false`;
3. `transportReady:false`;
4. WebDAV/cloud/relay/`fullBundle.v3` remains blocked/not-started;
5. Chat Saving CAS remains blocked/deferred;
6. a950 remains visible documented debt;
7. no cleanup authority is introduced;
8. the state authorizes only a transport-readiness evaluation, not transport start.

Transport can only start after a separate transport-readiness lane passes and explicitly proves transport safety. This
policy does not start transport.

## Final Decision

Selected policy option: **Option 2**.

Proceeding to a separate transport-readiness evaluation is allowed as a policy next step, but only as a non-writing,
non-starting evaluation lane. Global `productSyncReady:false` remains the authoritative product readiness flag.
WebDAV/cloud/relay/`fullBundle.v3` cannot start now. Chat Saving CAS remains blocked/deferred.

## Next Step

Recommended next slice: design a transport-readiness evaluation preflight that consumes
`localExportableSyncReady:true` as an input and proves it does not imply `transportReady:true`, does not write, and does
not start WebDAV/cloud/relay/`fullBundle.v3`.
