# CV-3.2 Reversible Canonical-Source Canary Runbook

## Purpose

This runbook performs a temporary, memory-only canary of `chat-atlas-ledger` as the canonical turn-record source, then returns to `legacy-durable-cache`.

It does not change the source default, persist a source choice, invoke `rebuildNow()`, click branches automatically, submit prompts automatically, or modify repository files.

## Safety Rules

1. Use the normal authenticated ChatGPT development profile with the Cockpit Pro extension already loaded.
2. Before P0, open the existing disposable branch conversation on its original longer branch. Use that same conversation for the entire P0-P9 sequence. Do not experiment on an important conversation.
3. Do not call the source setter outside P2 and P8.
4. Do not manually call any MiniMap rebuild API.
5. Stop immediately when a stage reports `ok: false`.
6. After P2, the rollback rule at every stage is:

   ```text
   Run: await H2O_CV3_CANARY.P8()
   If normal rollback fails or throws: reload the page immediately.
   After reload verify active and effective source are legacy-durable-cache.
   ```

7. Source selection is in memory only. A page reload is the emergency rollback and restores the legacy default.
8. Stage evidence is written to bounded `sessionStorage` keys only. This evidence storage does not persist the canonical-source choice.

## Install the Harness

Open `tools/validation/chat-atlas/chat-atlas-cv3-2-canary-console.js`, copy the entire file, and paste it once into the ChatGPT tab's DevTools console.

Expected console message:

```text
[CV-3.2] Installed cv3.2-canary-harness-v2. No stage or source switch has run.
```

Installing the harness does not run a stage and does not call the source setter.

You can inspect the installed methods without changing runtime state:

```js
Object.keys(H2O_CV3_CANARY).sort()
```

## P0 — Preflight and Readiness

Run:

```js
await H2O_CV3_CANARY.P0()
```

Required result:

- `ok: true`
- `canSwitch: true`
- all required `turnRuntime` APIs exist
- default, active, and effective source are `legacy-durable-cache`
- `persisted: false`
- ledger is ready and bound to the active chat
- canonical, ledger, rendered MiniMap, `H2O_MM_mapButtons`, and `H2O_MM_turnById` counts are equal and nonzero
- MiniMap current identities align with canonical records
- dual-run is ready and exact with zero current/total mismatches and zero instrumentation errors
- convergence blockers are empty
- current alias-conflict, duplicate, and quarantine gauges are zero

If any gate fails, do not run P1 or P2. The canary verdict is `CANARY_ABORTED_PREFLIGHT`.

Evidence key: `h2o:cv3:p0`

## P1 — Legacy Baseline Capture

Review P0, then run:

```js
await H2O_CV3_CANARY.P1()
```

The baseline captures normalized, ordered evidence for:

- source state and canonical version
- canonical records and ledger rows
- per-turn qId, current primary, current answer IDs/aliases, legacy `answerIds` order, NO ANSWER state, and page number
- MiniMap box identity and label
- compatibility-map sizes
- visible Answer Numbers and Question Numbers
- title bars, timestamps, page dividers, and washer projection
- Navigator, Navigation Controls, Thread Pages, Pagination, Unmount, and Highlight-dot presence/results
- dual-run, convergence, alias ownership, and MiniMap automatic-refresh diagnostics
- the first multi-variant turn, when one exists

Required result: `ok: true`.

Evidence keys:

```text
h2o:cv3:p1
h2o:cv3:legacy-baseline
```

## P2 — Switch to `chat-atlas-ledger`

Run only after P0 and P1 pass:

```js
await H2O_CV3_CANARY.P2()
```

This is the only forward source call in the harness.

Required result:

- setter result has `ok: true` and `changed: true`
- active and effective source become `chat-atlas-ledger`
- canonical turn version advances
- source remains non-persisted
- exactly one `evt:h2o:core:turn:updated` propagation is observed
- ledger remains ready
- dual-run mismatch state stays clean
- no alias conflict, duplicate, or quarantine gauge increments

If any assertion fails, stop and run:

```js
await H2O_CV3_CANARY.P8()
```

If rollback fails or throws, reload the page immediately. After reload, reinstall the harness and run:

```js
await H2O_CV3_CANARY.P8_RELOAD_VERIFY()
```

Evidence key: `h2o:cv3:p2`

## P3 — Static Consumer Verification

Allow the UI to settle, then run:

```js
await H2O_CV3_CANARY.P3()
```

The audit classifies each optional consumer as:

```text
absent
present-passing
present-failing
```

Coverage includes:

- canonical turn records
- MiniMap buttons and compatibility maps
- page dividers
- title bars
- Answer Numbers and Question Numbers
- timestamps
- Navigator and Navigation Controls
- Washer
- Thread Pages
- Unmount and Pagination adapters
- Highlight dots
- convergence diagnostics

Required result:

- `ok: true`
- all counts agree
- all rendered MiniMap primary identities match current canonical identities
- no present consumer fails
- dual-run remains exact
- convergence blockers remain empty
- source stays ledger

Variant ordering is reported in two independent fields:

```text
rawVariantOrderChanged
visibleVariantBehaviorChanged
```

A non-primary raw ordering change is a watch item only when `visibleVariantBehaviorChanged` is false. Any current-primary or visible branch behavior change is a failure.

Rollback rule: run `await H2O_CV3_CANARY.P8()`. If it fails or throws, reload immediately and verify legacy active/effective source.

Evidence key: `h2o:cv3:p3`

## P4 — Scroll/Hydration Storm

First arm the before-state:

```js
await H2O_CV3_CANARY.P4_ARM()
```

Then perform exactly these manual actions:

1. Rapidly scroll to the oldest reachable messages and back to the bottom.
2. Repeat the top/bottom cycle three times total.
3. Pause in the middle for two seconds during one cycle.
4. Return to the bottom.
5. Wait ten seconds without interacting.

Then run:

```js
await H2O_CV3_CANARY.P4()
```

P4 takes two settled reads three seconds apart to detect an idle rebuild loop.

Required result:

- counts and logical membership remain stable
- MiniMap current-primary alignment is exact
- any temporary identity drift has self-healed
- active/effective source remain ledger
- dual-run remains exact with no instrumentation error
- convergence blockers remain empty
- alias ownership remains clean
- no identity-drift or core-turn rebuild growth occurs between the two idle reads

Rollback rule: run `await H2O_CV3_CANARY.P8()`. If it fails or throws, reload immediately and verify legacy active/effective source.

Evidence keys: `h2o:cv3:p4-arm`, `h2o:cv3:p4`

## P5 — Same-Route Branch Shrink

Remain on the disposable branch conversation used for P0/P1. Confirm its original longer branch is still active, then run:

```js
await H2O_CV3_CANARY.P5_ARM()
```

Manually select the shorter branch under the same conversation route so downstream turns disappear. Do not navigate to a different conversation. Wait for the UI to settle, then run:

```js
await H2O_CV3_CANARY.P5()
```

The expected reduced count is derived from the actual before/after state; it is not hardcoded.

Required result:

- route/chat binding is unchanged
- canonical count decreases
- ledger, canonical, MiniMap, and compat-map counts agree
- removed turns and their current identities disappear
- MiniMap shrinks automatically
- qId and current primary alignment remains exact
- source remains ledger with no fallback
- dual-run, convergence, and alias diagnostics remain clean

Rollback rule: run `await H2O_CV3_CANARY.P8()`. If it fails or throws, reload immediately and verify legacy active/effective source.

Evidence keys: `h2o:cv3:p5-arm`, `h2o:cv3:p5`

## P6 — Same-Route Branch Regrowth

Arm the short-branch state:

```js
await H2O_CV3_CANARY.P6_ARM()
```

Manually switch back to the original longer branch under the same route. Wait for automatic MiniMap regrowth; do not call `rebuildNow()`. Then run:

```js
await H2O_CV3_CANARY.P6()
```

Required result:

- original count returns automatically
- baseline qIds and primary answer IDs return exactly
- temporary short-branch-only current identities disappear
- MiniMap regrows without duplicates or manual rebuilding
- source remains ledger
- dual-run exact parity resumes
- convergence blockers and alias conflict/quarantine gauges remain empty

Rollback rule: run `await H2O_CV3_CANARY.P8()`. If it fails or throws, reload immediately and verify legacy active/effective source.

Evidence keys: `h2o:cv3:p6-arm`, `h2o:cv3:p6`

## P7 — Streaming Turn

Arm the before-state:

```js
await H2O_CV3_CANARY.P7_ARM()
```

Submit this exact prompt manually:

```text
CV-3 LEDGER CANARY STREAMING PASS
```

While the answer is still streaming, run:

```js
await H2O_CV3_CANARY.P7_DURING()
```

`P7_DURING` must report `ok: true` and include a last turn with a non-null `primaryAId`. If it does not, rerun it while the answer is still streaming; the final P7 gate fails closed without this evidence.

After the answer completes and the UI settles, run:

```js
await H2O_CV3_CANARY.P7()
```

Required result:

- canonical, ledger, MiniMap, and compat-map counts increase by exactly one together
- final turn is answered and has a current primary
- MiniMap publishes that final current primary
- `streamingIdentityContinuity: true`
- the during and final rows have the same `turnNo` and `qId`, plus the same `logicalMemberKey` when both observations expose one
- a request placeholder captured during streaming is replaced by a different non-placeholder final primary
- the displaced placeholder remains owned by exactly that final logical member through `answerResolverAliases` or `resolverAliases`
- the displaced placeholder is historical resolver evidence; it is not required in `currentAliases`, `currentAnswerIds`, or canonical `_aliasIds`
- when the during primary is already a real identity, it remains the final primary and requires no historical promotion
- source remains ledger
- dual-run and convergence remain exact/clean
- no cross-member duplicate ownership or quarantine appears

Rollback rule: run `await H2O_CV3_CANARY.P8()`. If it fails or throws, reload immediately and verify legacy active/effective source.

Evidence keys: `h2o:cv3:p7-arm`, `h2o:cv3:p7-during`, `h2o:cv3:p7`

## P8 — Roll Back to `legacy-durable-cache`

Run:

```js
await H2O_CV3_CANARY.P8()
```

This is the only normal rollback source call in the harness.

Required result:

- setter returns `ok: true` and `changed: true`
- active and effective source are exactly `legacy-durable-cache`
- source remains non-persisted
- canonical version advances
- one normal turn-update propagation occurs
- all consumers settle against the current final conversation state
- canonical, ledger, MiniMap, and compat-map counts agree
- no mixed-source state remains
- original baseline turns that were not changed by branch/streaming work retain exact qId/current-primary identity

The rollback comparison intentionally uses the current post-stream conversation count. It does not require the pre-stream count.

If normal rollback fails or throws, reload the page immediately. Do not retry the forward switch. After reload, reinstall the harness and run:

```js
await H2O_CV3_CANARY.P8_RELOAD_VERIFY()
```

Required reload result: active source, effective source, and default source are all `legacy-durable-cache`; counts align without a manual MiniMap rebuild.

Evidence keys: `h2o:cv3:p8`, and on emergency reload `h2o:cv3:p8-reload`

## P9 — 60-Second Idle Stability

After successful rollback, arm the idle state:

```js
await H2O_CV3_CANARY.P9_ARM()
```

Wait a full 60 seconds without scrolling, clicking, opening Chat Atlas, or changing branches. Then run:

```js
await H2O_CV3_CANARY.P9()
```

Required result:

- elapsed time is at least 60 seconds
- active/effective source remain legacy
- source-switch count does not change
- all counts and MiniMap current identities remain aligned
- identity-drift and core-turn rebuild counters do not grow while idle
- dual-run mismatch counters do not grow
- conflict, duplicate, and quarantine gauges do not grow
- convergence blockers remain empty

Rollback rule remains: if the runtime is unexpectedly not legacy, run `await H2O_CV3_CANARY.P8()`. If that fails or throws, reload immediately and verify legacy active/effective source.

Evidence keys: `h2o:cv3:p9-arm`, `h2o:cv3:p9`

## P10 — Final Evidence Summary

Run:

```js
await H2O_CV3_CANARY.P10()
```

The final normalized object contains:

```text
ok
canaryVerdict
emergencyRollbackUsed
stageResults
sourceHistory
baselineSummary
ledgerSummary
rollbackSummary
variantOrderFinding
consumerResults
aliasDiagnostics
dualRunResults
convergenceResults
automaticRefreshResults
idleResults
failureStage
failureReasons
```

Possible verdicts:

```text
CANARY_PASS
CANARY_PASS_WITH_VARIANT_ORDER_WATCH
CANARY_FAILED_ROLLED_BACK
CANARY_FAILED_RELOAD_RECOVERED
CANARY_ABORTED_PREFLIGHT
```

`CANARY_PASS_WITH_VARIANT_ORDER_WATCH` is permitted only when raw non-primary `answerIds` ordering changed and visible/current-primary behavior did not change.

Any failed or missing stage produces a failed/aborted verdict. P10 does not switch sources or repair failed stages.

Rollback rule remains: if active/effective source are not legacy, run `await H2O_CV3_CANARY.P8()`. If rollback fails or throws, reload immediately and verify legacy active/effective source.

Evidence key: `h2o:cv3:p10`

## Evidence Retrieval

Retrieve one stage:

```js
H2O_CV3_CANARY.readStage('P4')
```

Retrieve the full baseline:

```js
JSON.parse(sessionStorage.getItem('h2o:cv3:legacy-baseline'))
```

Retrieve the final summary:

```js
JSON.parse(sessionStorage.getItem('h2o:cv3:p10'))
```

Do not mutate returned snapshots or runtime records. Evidence arrays preserve meaningful source order, especially `answerIds`, current answer IDs, and current aliases.
