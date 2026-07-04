# Folder Sync Binding F15 Restart Survival Implementation

Date: 2026-07-01

Verdict: BINDING F15 RESTART-SURVIVAL FIX IMPLEMENTED.

This implementation follows the durable-gate hardening preflight `e50db532a1dc32ebd2372d2c53f25c32f450c198` and the ledger/journal restart-survival audit `be3d982e216c9498b3396d655c6f189bceb1a266`.

## Blocker

Phase A after the settled materialization bridge passed in-session, including `controlledApply.status:"applied"`, `canonicalBindingWriteCount:1`, `idempotencyPersisted:true`, `afterBindingHash === requestedBindingHash`, `immediateReadbackMatchesRequested:true`, and `duplicateReplayZeroWrite:true`.

After Desktop Studio restart, Phase B failed: canonical `folder_bindings` readback returned the old before hash and `reconcileSurvivalProven:false`. Diagnostics showed the consumed ledger and F15 execute/settlement journal survived restart, while canonical `folder_bindings` reverted. The durable API could also report `durable:true` while `matchesRequested:false`.

Old before hash:
`sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d`

Requested/applied hash:
`sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869`

## Implementation

Changed product source:

- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`

Durable truth hardening:

- `bindingDurablePersistenceFence()` no longer treats `busy === 0` alone as durable. A WAL checkpoint is durable only when the checkpoint row is parseable, `busy === 0`, `log >= 0`, `checkpointed >= 0`, and `log === checkpointed`.
- `confirmCanonicalChatFolderBindingDurable()` now returns `durable:true` only when the checkpoint fence is durable and the fresh canonical binding hash equals the requested binding hash.
- If the fresh canonical hash mismatches, `durable:false` is returned with `reason:"fresh-canonical-hash-mismatch-not-durable"` or `reason:"fresh-canonical-hash-unavailable-not-durable"`.
- Existing diagnostic fields are preserved: `canonicalBindingHash`, `matchesRequested`, `checkpointBusy`, `checkpointLog`, `checkpointFrames`, and `fenceInterpretation`.

Consumed-ledger recovery ordering:

- `classifyChatFolderBindingRepairConflict()` no longer returns `duplicate` solely because `appliedKeys[idempotencyKey]` exists.
- A consumed key skips only when current canonical state already matches the requested end-state: target folder for bind/move, or unbound state for unbind.
- If the key is consumed but canonical state diverged/reverted, the handler can proceed through the guarded F15 materialization path.
- For recovery when the consumed row already exists, the handler treats idempotency as already persisted after hash and durable gates pass, preserving true duplicate zero-write behavior when state already matches.

Settled-journal restart convergence:

- Successful settled materialization now records a bounded local materialization record keyed to the F15 settled execute journal identity.
- `runF15SettledBindingRestartConvergence()` verifies each record against a survived execute-journal row with phase `settled`, domain `library.binding`, matching operation kind, subject id, dedupe/event identity, and settlement digest.
- On init/reload, the store runs convergence:
  - already-current canonical binding state is skipped with zero writes;
  - diverged/missing canonical state is re-materialized through `materializeSettledCanonicalChatFolderBinding()`;
  - no write occurs when the settled journal row cannot be verified.
- Diagnostics include checked, journal-verified, converged, already-current, and skipped counts.

## Safety Boundaries

- No live Phase A was run in this implementation slice.
- No Phase B was run in this implementation slice.
- No Desktop reload/restart was run by this slice.
- No fallback was added: no `allowF7Fallback`, no `f15AllowF7Fallback`, no `explicitF7Fallback`.
- No bare legacy repair write was restored.
- `post-apply-binding-hash-mismatch` remains in front of the durable gate and ledger consume.
- Busy-aware durable gate remains.
- Conflict runtime and `requireContext` were not weakened.
- `binding-mismatch` remains blocked.
- `productSyncReady:false` remains.
- WebDAV/cloud/relay/fullBundle.v3 remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Proof Posture

The implementation validator proves source anchors and local decision behavior for:

1. durable false when `matchesRequested:false`;
2. durable true only for checkpoint-confirmed plus requested-hash match;
3. consumed ledger skip only when current canonical state already matches;
4. consumed ledger recovery when current canonical state diverged;
5. settled-journal verified convergence and idempotent already-current skips;
6. no fallback/productSyncReady/WebDAV/Chat Saving drift.

The validator is source-grounded with small pure-behavior simulations. A real Desktop restart/reload survival proof is still required after independent review. This slice does not bypass Phase B.

Recommended next step: independent review, then a separate live Phase A/Phase B retry sequence.
