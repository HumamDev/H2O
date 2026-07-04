# Folder Sync - Binding F15 Live Restart-Survival Closeout

Verdict: **F15 SETTLED CHAT-FOLDER BINDING REPAIR RESTART-SURVIVAL IS LIVE-PROVEN (PHASE A + PHASE B PASSED)**.

This is closeout evidence for the successful live Phase A (in-session) + Phase B (post full Desktop restart) proof of
the F15-settled chat-folder binding repair. No product source was edited by this closeout slice, no live Phase A/Phase B
was rerun by this slice, no fallback was added, `productSyncReady` was not flipped, and WebDAV/cloud/relay and Chat
Saving CAS remain blocked.

## Commit Chain

- F15 settled materialization implementation: `81de3a63`.
- F15 restart-survival implementation (durable composite + ledger recovery + convergence): `a28f2a5c`.
- F15 restart convergence awaited/observable fix: `a6f8b978`.

## Hashes

- Before / old binding hash: `sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d`.
- Requested / Phase A applied hash: `sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`.

## Phase A (in-session) - PASSED

- `controlledApply.status:"applied"`, `reason:"binding-repair-applied"`.
- `canonicalBindingWriteCount:1`, `idempotencyPersisted:true`.
- `f15Delegation.evidencePresent:true`, `f15Delegation.ok:true`.
- `beforeBindingHash: sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d`.
- `requestedBindingHash: sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`.
- `afterBindingHash: sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`.
- `immediateReadbackMatchesRequested:true`.
- `durableGate.fenceInterpretation:"checkpoint-confirmed"`, `durableGate.checkpointBusy:0`, `durableGate.durable:true`.
- `duplicateReplay.status:"skipped"`, `duplicateReplay.reason:"duplicate"`,
  `duplicateReplay.canonicalBindingWriteCount:0`, `duplicateReplayZeroWrite:true`.
- `bindingMismatchStillBlocked:true`, `productSyncReady:false`, WebDAV/cloud/relay blocked, Chat Saving CAS blocked.

## Phase B (post full Desktop Studio restart) - PASSED

- `schema:"h2o.studio.folder-sync.binding-f15-settled-live-proof.phase-b.v3"`.
- `convergenceReadyAvailable:true`, `convergenceReadyResult.ok:true`.
- `postRestartSnapshotHash: sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`.
- `postRestartRecomputedHash: sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e`.
- `postRestartMatchesPhaseARequested:true`, `oldHashNotRestored:true`, `reconcileSurvivalProven:true`.
- `bindingMismatchStillBlocked:true`, `productSyncReady:false`, WebDAV/cloud/relay blocked, Chat Saving CAS blocked.

## Restart Convergence Proof (survived + idempotent safety net)

- `convergenceReadyResult.source:"init"` - convergence ran on the real startup path (the awaited one-shot gate).
- `convergenceReadyResult.checkedCount:2` - two settled binding materialization records were present after restart.
- `convergenceReadyResult.journalVerifiedCount:2` - both records were confirmed against the survived settled
  execute-journal (journal-verified before any re-materialization).
- `convergenceReadyResult.alreadyCurrentCount:2` - canonical `folder_bindings` already matched both settled decisions.
- `convergenceReadyResult.convergedCount:0` - no re-materialization was needed; the write itself survived restart.
- `convergenceReadyResult.skippedCount:0`, `convergenceReadyResult.blockers:[]`, `convergenceReadyResult.warnings:[]`.

Interpretation: the durable `folder_bindings` write survived the restart (post-restart snapshot equals the Phase A
requested hash), AND the awaited restart convergence ran, journal-verified the settled records, and correctly performed
zero writes because the state was already current. Restart-survival is proven both directly (survived write) and by the
idempotent, journal-verified convergence safety net.

## Durable Gate Truth (hardening confirmed live)

- Phase A: `durable:true` with `fenceInterpretation:"checkpoint-confirmed"`, `checkpointBusy:0`.
- Phase B: `durable:true` only with `matchesRequested:true`; `fenceInterpretation:"checkpoint-confirmed"`,
  `checkpointBusy:0`, `checkpointLog:0`, `checkpointFrames:0`, `reason:"checkpoint-confirmed"`.
- The composite durable rule (`fence.durable === true && matchesRequested === true`) and the full-merge fence
  (`log === checkpointed`) held live: a fully-merged checkpoint with a requested-hash match is the only durable-true
  path, and Phase B confirmed it after restart.

## Duplicate Replay

- Phase A duplicate replay: `status:"skipped"`, `reason:"duplicate"`, `canonicalBindingWriteCount:0`,
  `duplicateReplayZeroWrite:true` - a same-key replay against an already-current canonical state is zero-write, and the
  consumed-ledger recovery ordering (current-state-aware) is preserved.

## Boundaries Held Throughout The Proof

- No fallback: no `allowF7Fallback` / `f15AllowF7Fallback` / `explicitF7Fallback` and no bare
  `moveCanonicalChatFolderBinding` repair route.
- `productSyncReady` was not flipped during the proof (`productSyncReady:false` in both phases).
- `binding-mismatch` remained blocked (`bindingMismatchStillBlocked:true` in both phases).
- WebDAV/cloud/relay remained blocked; Chat Saving WebDAV/cloud/archive CAS remained blocked.
- `post-apply-binding-hash-mismatch`, the busy-aware durable gate, the conflict runtime, `requireContext`, and the
  planned-unbind projection remained intact.

## Readiness State After This Closeout

- The sortOrder blocker was already cleared (S5). The F15-settled binding repair is now live-proven end-to-end
  (Phase A + Phase B restart survival).
- `binding-mismatch` is STILL blocked in F11 and `productSyncReady` is STILL `false`. Flipping the binding-mismatch
  allowed-set and/or `productSyncReady` is a SEPARATE, explicit local readiness decision - it is NOT performed by this
  closeout. WebDAV/cloud/relay is NOT the next step.

## Conclusion

F15 settled chat-folder binding repair restart-survival is LIVE-PROVEN: Phase A applies durably in-session with a
truthful durable gate and zero-write duplicate replay; Phase B survives a full Desktop restart with the post-restart
canonical hash equal to the Phase A requested hash, backed by an awaited, journal-verified, idempotent convergence
safety net. All release/safety boundaries held. The next step is a separate binding-mismatch allowed-set /
`productSyncReady` readiness decision - not WebDAV/cloud/relay.
