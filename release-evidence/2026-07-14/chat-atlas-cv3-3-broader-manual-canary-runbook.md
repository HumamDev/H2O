# Chat Atlas CV-3.3 Broader Manual Canary Runbook

## Decision and Scope

- Gate: CV-3.3
- Verdict entering gate: `READY_FOR_BROADER_MANUAL_CANARY`
- Accepted predecessor: CV-3.2 formal pass commit `b20a476db4512fe83cd4dd28c27d91a8a21b1a85`
- Runtime default: `legacy-durable-cache`
- Exposure: manual, session-scoped, memory-only, and reversible
- Production default flip: not approved
- Persisted opt-in or cohort mechanism: none
- Studio surfaces: excluded

CV-3.3 broadens operator-driven coverage. It does not change runtime code, persist source selection, approve an unattended rollout, or authorize a production default flip.

### Variant Coverage Correction

CV-3.2 was not variant-free. Its accepted baseline included turn 5 with two `answerIds`; `rawVariantOrderChanged` and `visibleVariantBehaviorChanged` were both false. CV-3.2 therefore proved passive parity for an existing multi-answer turn. It did not exercise active regenerate, user-message edit, or answer-variant switching while the ledger was canonical. CV-3.3-S3 closes that active mutation and selection gap.

## Tooling and Reuse Boundary

Install the capacity-safe CV-3.2 v5 harness from:

```text
tools/validation/chat-atlas/chat-atlas-cv3-2-canary-console.js
```

For labeled bounded snapshots, also install:

```text
tools/validation/chat-atlas/chat-atlas-cv3-3-navigation-spot-check-console.js
```

Evaluation of either script only installs its API. It does not switch sources or begin a scenario.

Before starting any scenario, require:

```js
if (H2O_CV3_CANARY.version !== "cv3.2-canary-harness-v5") {
  throw new Error(`CV-3.3 requires v5; found ${H2O_CV3_CANARY.version}`)
}
if (H2O_CV3_CANARY.evidenceSchema !== 5) {
  throw new Error(`CV-3.3 requires evidence schema 5; found ${H2O_CV3_CANARY.evidenceSchema}`)
}
```

Schema 5 keeps full captures in memory while persisting compact stage projections and deterministic fingerprints. It retains the 900,000-character stage-record limit, checkpoint schema 2, and the 16 KiB durable checkpoint limit. A v5 run must not resume schema-less or v4 session evidence; run `CLEANUP()` only after any prior evidence has been safely exported.

Safe v5 reuse:

- P0: entry readiness
- P1: legacy baseline
- P2: forward switch to `chat-atlas-ledger`
- `inspect()`: rich read-only state capture
- P8: normal rollback and rollback equivalence for a same-route scenario
- `EXPORT()` and `CLEANUP()`: evidence export and cleanup

S1 additionally uses P3, P4_ARM, and P4 because v5 gives those stages a capacity-safe large-conversation schema and verifies compact movement references. Outside S1, do not force CV-3.3 through CV-3.2 P3-P7, P9, or P10 unless a scenario procedure explicitly requires that stage. S6 uses direct, explicit operator setter calls because two tabs must not share the CV-3.2 local checkpoint lifecycle.

The spot-check API is:

```js
H2O_CV3_3_NAV_SPOT_CHECK.START({ scenarioId: "CV3.3-S4-<unique-id>" })
H2O_CV3_3_NAV_SPOT_CHECK.SNAPSHOT("label")
await H2O_CV3_3_NAV_SPOT_CHECK.EXPORT()
H2O_CV3_3_NAV_SPOT_CHECK.CLEANUP()
```

It records compact diagnostics only under `h2o:cv3-3:*`, with a 24-snapshot and 64 KiB limit. It never switches sources, navigates, reloads, or writes DOM.

## Safety Contract

1. Use disposable conversations and branches only.
2. Before every scenario, verify active, effective, and default source are `legacy-durable-cache`.
3. Give every scenario a unique ID in the form `CV3.3-SN-<unique-id>`.
4. Never run two scenarios concurrently in the same tab.
5. Stop on the first gate-class failure.
6. Normal rollback is an explicit setter call to `legacy-durable-cache`; use v5 P8 when its same-route baseline exists.
7. Emergency rollback is an immediate page reload. Reinstall diagnostics after reload and verify active/effective/default source are legacy.
8. Export evidence before cleanup. Cleanup is allowed only after the JSON is safely downloaded and its byte size and SHA-256 are recorded.
9. Do not navigate away while a scenario requiring same-route branch, page, or variant evidence is active.
10. Do not modify Studio state or use Studio surfaces during any scenario.
11. Do not call a manual MiniMap rebuild API.
12. Source selection must remain memory-only and non-persisted.

After P2, keep this rollback instruction visible:

```text
Normal rollback: H2O.turnRuntime.setChatAtlasCanonicalSource("legacy-durable-cache")
Emergency rollback: reload immediately, reinstall diagnostics, and verify legacy active/effective/default source.
```

## Per-Scenario Entry Criteria

Every scenario must begin with all of the following:

- legacy active and effective
- default source is legacy
- source `persisted` is false
- ledger ready
- active chat key matches ledger chat key
- canonical, ledger, MiniMap, `mapButtons`, `turnById`, and `coreTurnList` counts aligned
- dual-run exact with zero current/total mismatches and zero instrumentation errors
- convergence blockers empty
- alias conflict, duplicate-owner, and quarantine gauges zero
- MiniMap current identity alignment exact
- no existing `h2o:cv3:*` or `h2o:cv3-3:*` evidence keys, unless explicitly resuming the same scenario after reload

For same-tab scenarios, the standard entry sequence is:

```js
H2O_CV3_CANARY.CLEANUP()
H2O_CV3_3_NAV_SPOT_CHECK.CLEANUP()
await H2O_CV3_CANARY.P0()
await H2O_CV3_CANARY.P1()
H2O_CV3_3_NAV_SPOT_CHECK.START({ scenarioId: "CV3.3-SN-<unique-id>" })
```

All calls must return `ok: true`. Capture the P1 state and the spot-check START result before switching.

## Per-Scenario Abort Criteria

Abort and rollback immediately on any of these:

- source setter failure or throw
- unexpected source persistence
- count divergence that remains after settling
- cross-chat identity leakage
- alias conflict, duplicate-owner, or quarantine growth
- persistent MiniMap count or identity mismatch
- dual-run mismatch or instrumentation error
- convergence blocker
- rollback failure
- checkpoint, snapshot, export, or evidence-size failure
- uncontrolled MiniMap rebuild activity
- visible branch or selected-answer behavior inconsistent with the operator action

Record the first failing gate and do not continue later scenario actions.

## Evidence Contract

Every scenario artifact must record:

- scenario ID and scenario name
- chat shape summary and route type
- starting and ending source state
- start/end timestamps
- labeled action summaries
- diagnostics snapshots before switch, after switch, after each required action, before rollback, and after rollback
- failure reasons, if any
- normal or emergency rollback result
- exported JSON filename
- filesystem byte size
- SHA-256

Use `H2O_CV3_CANARY.inspect()` for rich scenario-specific state and the spot-check helper for bounded route/source/count history. At export time, create one JSON object containing the scenario metadata, manual action log, required rich inspections, setter results, rollback result, and parsed spot-check export. Save one JSON artifact per scenario.

Example final spot-check export:

```js
const compactExport = await H2O_CV3_3_NAV_SPOT_CHECK.EXPORT()
// Require compactExport.ok === true, then save compactExport.json.
```

Do not clean either evidence prefix until the scenario JSON has been downloaded and independently hashed.

## Scenario Matrix

| ID | Scenario | Required chat/session shape | Result |
| --- | --- | --- | --- |
| CV3.3-S1 | Large Conversation Canonical Retention | At least 60 canonical turns; preferably 75 or more | NOT_RUN |
| CV3.3-S2 | NO ANSWER and interrupted generation | Existing NO ANSWER plus one deliberate interruption | NOT_RUN |
| CV3.3-S3 | Variants, regenerate, and edit | Existing variants plus disposable mutation branch | NOT_RUN |
| CV3.3-S4 | Multi-conversation route rebind | A, B, C, A with `/c/` and `/g/.../c/` where available | NOT_RUN |
| CV3.3-S5 | Reload while ledger is active | One disposable conversation in one tab | NOT_RUN |
| CV3.3-S6 | Second-tab isolation | Same conversation in two tabs | NOT_RUN |
| CV3.3-S7 | Session soak | Minimum 30 minutes, preferred 60 | NOT_RUN |

## CV3.3-S1 - Large Conversation Canonical Retention

### Required Candidate Shape And Entry Criteria

- at least 60 canonical turns; preferably 75 or more
- an ordinary `/c/` or `/g/.../c/` route
- MiniMap count aligned one-to-one with the canonical turn count
- ledger ready with member count aligned to canonical membership
- stable, contiguous canonical turn numbers covering the full observed range
- clean identity, dual-run, convergence, alias, and MiniMap-alignment gates
- `H2O_Pagination.getConfig().enabled === false`

Native ChatGPT virtualization may mount only part of the conversation DOM. S1 does not require every turn shell or message body to be mounted simultaneously. A mathematical grouping such as `83 turns / 25 = 4 groups` may be recorded as descriptive metadata only; it is not evidence of active pagination coverage.

### Pagination Exclusion And Safety Warning

- Keep `H2O_Pagination` disabled throughout CV3.3-S1.
- Do not call `H2O_Pagination.applySetting("pwEnabled", true)`.
- Do not call `H2O_Pagination.setEnabled(true)`.
- Do not enable title-list mode.
- Do not invoke Chat Page Divider, page-dot, page-collapse, or page expand controls.
- Pagination Windowing, Chat Page Dividers, title-list mode, and H2O-managed page collapse are outside CV-3.3 scope.

If pagination becomes enabled during S1, the scenario is invalid. Stop immediately, restore pagination to its prior disabled setting, verify the full legacy canonical and MiniMap counts return, and do not reuse the invalidated evidence as an S1 result.

### Known Excluded Defect

Pagination Windowing currently has a completeness precondition defect when ChatGPT mounts only a partial conversation DOM. In the confirmed observation, enabling pagination before harness installation or ledger activation caused an `83 -> 1` canonical and MiniMap shrink because a one-shell DOM discovery was published into Core without proving full-chat completeness. Disabling pagination restored both counts to 83. This was not a Chat Atlas ledger failure. The defect belongs to the separate, paused Pagination Windowing lane; CV-3.3 must neither fix nor depend on it.

### Objective

Prove that `chat-atlas-ledger` as the temporary canonical source retains complete, stable logical membership for a large conversation while native ChatGPT virtualization hydrates and unmounts DOM content. Canonical count and numbering must remain independent of visible DOM membership, MiniMap must remain one-to-one with canonical turns, and rollback must restore exact legacy alignment.

### Operator Flow

#### A. Legacy Baseline

1. Confirm pagination is disabled and record its configuration.
2. Require active, effective, and default canonical source to be `legacy-durable-cache`.
3. Record canonical count, MiniMap count, ledger readiness/member count, and canonical turn-number range.
4. Require identity alignment, dual-run, convergence, and alias gates to be clean.

#### B. Install And Capture The Accepted Baseline

1. Install the CV-3.2 v5 harness and the CV-3.3 spot-check helper.
2. Run `CLEANUP()` only when no prior evidence still needs preservation.
3. Create a unique S1 scenario ID and execute this entry wrapper:

```js
const S1_SCENARIO_ID = "CV3.3-S1-<unique-id>"
if (H2O_CV3_CANARY.version !== "cv3.2-canary-harness-v5") throw new Error("v5 harness required")
if (H2O_CV3_CANARY.evidenceSchema !== 5) throw new Error("evidence schema 5 required")
const s1P0 = await H2O_CV3_CANARY.P0()
if (!s1P0.ok) throw new Error(`P0 failed: ${JSON.stringify(s1P0.failureReasons)}`)
const s1P1 = await H2O_CV3_CANARY.P1()
if (!s1P1.ok) throw new Error(`P1 failed: ${JSON.stringify(s1P1.failureReasons)}`)
const s1SpotStart = H2O_CV3_3_NAV_SPOT_CHECK.START({
  scenarioId: S1_SCENARIO_ID,
  scenario: "CV3.3-S1",
})
if (!s1SpotStart.ok) throw new Error(`spot-check START failed: ${JSON.stringify(s1SpotStart)}`)
```

P1 persists one trimmed schema-5 baseline at `h2o:cv3:legacy-baseline`; its stage record references that baseline rather than duplicating it.

#### C. Activate Ledger Canonical Source

1. Run the v5 P2 and P3 procedures without introducing any pagination, title-list, divider, or page-collapse action:

```js
const s1P2 = await H2O_CV3_CANARY.P2()
if (!s1P2.ok) throw new Error(`P2 refused or failed: ${JSON.stringify(s1P2.failureReasons)}`)
const s1P3 = await H2O_CV3_CANARY.P3()
if (!s1P3.ok) throw new Error(`P3 failed: ${JSON.stringify(s1P3.failureReasons)}`)
const s1LedgerReady = H2O_CV3_3_NAV_SPOT_CHECK.SNAPSHOT("ledger-ready")
if (!s1LedgerReady.ok) throw new Error(`ledger-ready snapshot failed: ${JSON.stringify(s1LedgerReady)}`)
```

2. P2 must pass its forward-switch and projected-P8 capacity preflight before it calls the setter.
3. Require ledger active/effective, source non-persisted, and default source still legacy.
4. Verify the canonical count did not shrink and MiniMap remains aligned to the original full count.
5. Preserve a rich `H2O_CV3_CANARY.inspect()` result in memory only when detailed diagnosis is needed; ordinary persisted stages must use v5 compact evidence.

#### D. Exercise Native Large-Chat Behavior

1. Arm P4 before any movement. A failed arm does not authorize scrolling:

```js
const s1P4Arm = await H2O_CV3_CANARY.P4_ARM()
if (!s1P4Arm.ok || !s1P4Arm.manualActionAuthorized) {
  throw new Error(`P4_ARM refused: ${JSON.stringify(s1P4Arm.failureReasons)}`)
}
```

2. Scroll toward the oldest content that native ChatGPT makes reachable, wait for settling, then run exactly:

```js
const s1Oldest = H2O_CV3_3_NAV_SPOT_CHECK.SNAPSHOT("oldest")
if (!s1Oldest.ok) throw new Error(`oldest snapshot failed: ${JSON.stringify(s1Oldest)}`)
```

3. Scroll through the middle range, wait for settling, then run exactly:

```js
const s1Middle = H2O_CV3_3_NAV_SPOT_CHECK.SNAPSHOT("middle")
if (!s1Middle.ok) throw new Error(`middle snapshot failed: ${JSON.stringify(s1Middle)}`)
```

4. Return to the newest content, wait for settling, then run exactly:

```js
const s1Newest = H2O_CV3_3_NAV_SPOT_CHECK.SNAPSHOT("newest")
if (!s1Newest.ok) throw new Error(`newest snapshot failed: ${JSON.stringify(s1Newest)}`)
```

5. Use existing MiniMap navigation where supported, without invoking page dividers or page controls.
6. Allow normal native hydration and unmounting to occur. Do not require all turn shells to be mounted together.
7. After the final settle, run P4:

```js
const s1P4 = await H2O_CV3_CANARY.P4()
if (!s1P4.ok) throw new Error(`P4 failed: ${JSON.stringify(s1P4.failureReasons)}`)
if (!s1P4.movementEvidence?.movementCoverageComplete) throw new Error("P4 movement coverage incomplete")
```

P4 accepts only helper evidence for the same S1 scenario and chat with all three exact labels. Free-text movement claims, foreign scenario evidence, and foreign chat evidence fail closed.

#### E. Verify After Every Movement

Record and verify:

- canonical turn count and contiguous turn-number range
- ledger member count
- MiniMap button count
- duplicate, missing, or renumbered identities
- dual-run and convergence results
- alias conflict, duplicate-owner, and quarantine gauges
- identity-drift and automatic-rebuild counters
- whether rebuild activity settles after hydration
- pagination remains disabled
- P4 direct in-memory membership/identity comparison result and true mismatch count
- P4 oldest/middle/newest compact snapshot references and `movementCoverageComplete`
- P4 fingerprint continuity as corroboration only; direct row comparison remains dispositive

#### F. Rollback And Evidence

1. Run the v5 P8 rollback procedure so the setter returns to `legacy-durable-cache`:

```js
const s1P8 = await H2O_CV3_CANARY.P8()
if (!s1P8.ok || s1P8.evidenceDegraded) {
  throw new Error(`P8 failed or evidence degraded: ${JSON.stringify(s1P8.failureReasons)}`)
}
```

2. Use reload only as the emergency fallback if normal rollback fails.
3. Confirm exact canonical count, identities, ordering, turn numbering, and MiniMap alignment under legacy.
4. Capture the final legacy state and require active/effective/default source to be legacy:

```js
const s1LegacyRestored = H2O_CV3_3_NAV_SPOT_CHECK.SNAPSHOT("legacy-restored")
if (!s1LegacyRestored.ok) throw new Error(`legacy-restored snapshot failed: ${JSON.stringify(s1LegacyRestored)}`)
```

5. Export both evidence sources and safely download them before cleanup:

```js
const s1CanaryExport = H2O_CV3_CANARY.EXPORT()
const s1MovementExport = await H2O_CV3_3_NAV_SPOT_CHECK.EXPORT()
if (!s1CanaryExport.ok || !s1MovementExport.ok) throw new Error("S1 export failed")
```

6. Record filename, byte size, and SHA-256. Only after both exports are safely preserved may the operator run:

```js
H2O_CV3_CANARY.CLEANUP()
H2O_CV3_3_NAV_SPOT_CHECK.CLEANUP()
```

### S1 Abort Criteria

Abort immediately and restore the safe legacy baseline on any of these:

- pagination becomes enabled
- canonical count shrinks after native DOM hydration settles
- MiniMap count shrinks with visible DOM membership
- a canonical turn disappears, duplicates, or is unexpectedly renumbered
- cross-chat identity leakage
- dual-run mismatch or instrumentation error
- convergence blocker
- alias conflict, duplicate-owner, or quarantine growth
- persistent MiniMap identity drift or uncontrolled rebuild activity
- rollback failure
- checkpoint, export, or other evidence failure

### Pass Criteria

- the original full canonical count is retained throughout the ledger-active period
- no turn disappears merely because its DOM shell or message content is unmounted
- no duplicate or renumbered turn appears
- ledger member count and MiniMap count remain aligned one-to-one with canonical turns
- dual-run and convergence remain exact
- alias conflict, duplicate-owner, and quarantine gauges remain clean
- identity-drift and rebuild activity settle after native hydration changes
- rollback restores exact legacy count, ordering, identities, numbering, and MiniMap alignment
- evidence export succeeds
- final active/effective/default source is `legacy-durable-cache`
- pagination remains disabled for the entire valid scenario

## CV3.3-S2 - NO ANSWER and Interrupted Generation

### Required Shape

- one real pre-existing NO ANSWER turn
- one fully settled answered control turn
- one new generation deliberately interrupted while ledger is active

Do not treat these three states as interchangeable.

### Procedure

1. Complete the standard entry sequence with a unique S2 ID.
2. In the legacy baseline, identify and record the existing NO ANSWER member's turn number, qId, null/empty primary/answer fields, current aliases, resolver aliases, and MiniMap representation.
3. Record the answered control member's corresponding fields.
4. Run P2 and capture `S2-ledger-ready`.
5. Submit a disposable prompt, wait until streaming is visible, then use the normal Stop control once.
6. Capture `S2-interrupted-immediate`, wait for all ledger work to settle, then capture `S2-interrupted-settled` and a rich inspection.
7. Verify the pre-existing NO ANSWER member is unchanged, the interrupted member has a coherent settled representation, and the answered control remains answered.
8. Run P8, capture `S2-legacy-restored`, export, download, hash, then clean up.

### Pass Criteria

- existing NO ANSWER remains qId-keyed with null primary and empty current answer IDs
- MiniMap uses its supported NO ANSWER representation; absence of an explicit marker must be documented as not evaluable, not invented
- interrupted generation settles without leaking request/shell IDs to another member
- no duplicate logical member is created
- answered control remains answered with current primary published by MiniMap
- rollback equivalence accepts only same-turn resolver-owned continuity
- count, alias, dual-run, convergence, and final legacy gates pass

## CV3.3-S3 - Variants, Regenerate, and Edit

CV-3.2 already covered passive parity for a multi-answer turn. S3 specifically tests active mutation and answer selection while ledger is canonical.

### Procedure

1. Use a disposable conversation with an existing multi-answer turn and complete the standard entry sequence with a unique S3 ID.
2. Record each baseline variant ID, raw `answerIds` order, connected/current answer evidence, and visibly selected answer.
3. Run P2 and capture `S3-ledger-ready`.
4. Switch to another existing answer variant. Record raw order and visible selection before and after settling.
5. Regenerate one answer. Record streaming placeholder/current identity, settled final primary, resolver continuity, raw answer order, and visible selection.
6. Edit one earlier user message in a disposable branch so downstream turns shrink. Capture `S3-short-branch` after settling.
7. Restore the original branch and capture `S3-original-branch-restored`.
8. Verify temporary short-branch current identities are absent and original downstream identities are restored or resolver-equivalent to their unique original turns.
9. Ensure the original intended answer variant is visibly selected before rollback.
10. Run P8 and verify rollback preserves that visible branch selection. Export, download, hash, then clean up.

### Pass Criteria

- visible selected answer always matches the operator-selected variant
- raw `answerIds` order is recorded separately from visible behavior
- raw order need not be identical unless a consumer contract demonstrably depends on it
- resolver ownership remains unique and no involved identity is quarantined
- regenerated primary settles to a real non-placeholder current identity
- no stale short-branch identities remain after regrowth
- no count divergence, dual-run mismatch, convergence blocker, or persistent MiniMap drift
- rollback preserves visible branch selection and ends on legacy

## CV3.3-S4 - Multi-Conversation Navigation and Route Rebind

### Required Routes

- at least three conversations A, B, and C
- at least one ordinary `/c/` route
- at least one `/g/.../c/` project or custom-GPT route where available

If no `/g/.../c/` route is available to the operator, S4 is incomplete and CV-3.3 cannot pass without an explicit architecture-review waiver.

### Procedure

1. Open conversation A, complete P0/P1, and start the spot-check helper with a unique S4 ID.
2. Run P2 and capture `A-ledger-ready`.
3. Navigate manually A -> B. Capture `B-immediate` before readiness and `B-ready` after ledger readiness and matching chat key.
4. Navigate manually B -> C. Capture `C-immediate` and `C-ready` the same way.
5. Navigate manually C -> A. Capture `A-return-immediate` and `A-return-ready`.
6. At every snapshot record href, route/chat key, active/effective/default source, ledger readiness/chat key, selected count, legacy count, switch count, `lastSelection`, dual-run summary, convergence summary, aliases, and MiniMap alignment.
7. From final A, run P8 and capture `A-legacy-restored`.
8. Export, download, hash, then clean up.

### Expected Rebind Behavior

- a temporary effective legacy fallback is allowed only while ledger data is not ready for the new chat
- ledger may become effective again only after readiness and matching chat key
- canonical records, ledger members, and MiniMap identities from the previous chat must not leak into the next chat
- each ready checkpoint has aligned counts and exact diagnostics for that chat
- final rollback from A succeeds and ends on legacy

## CV3.3-S5 - Reload While Ledger Is Active

### Procedure

1. Complete P0/P1, start a unique S5 spot-check, run P2, and capture `S5-ledger-before-reload`.
2. Export an interim compact snapshot before reload.
3. Reload the page normally without first rolling back.
4. Reinstall both scripts. Resume the same spot-check ID with:

   ```js
   H2O_CV3_3_NAV_SPOT_CHECK.START({ scenarioId: "CV3.3-S5-<same-id>", resume: true })
   ```

5. Do not rerun P0. Use `H2O_CV3_CANARY.inspect()` and capture `S5-after-reload`.
6. Require active/effective/default source legacy and `persisted: false`.
7. Optionally call P2 once more using the preserved P0/P1 session evidence, verify ledger effective, then run P8 and capture `S5-optional-legacy-restored`.
8. Export, download, hash, then clean up.

### Pass Criteria

- reload restores legacy active/effective/default source without emergency repair
- no persisted ledger selection exists
- all counts and identities align after settling
- optional reactivation and rollback, if performed, both succeed

## CV3.3-S6 - Second-Tab Isolation

Do not use the CV-3.2 P0-P10 checkpoint lifecycle concurrently in both tabs. Use the read-only helper in each tab and explicit operator setter calls only in tab A.

### Procedure

1. Open the same disposable conversation in tabs A and B.
2. Verify both tabs independently satisfy all entry criteria and are legacy.
3. Clean only `h2o:cv3-3:*` evidence in each tab, then start unique S6-A and S6-B helper IDs.
4. In tab A only, call:

   ```js
   H2O.turnRuntime.setChatAtlasCanonicalSource("chat-atlas-ledger")
   ```

5. Capture `A-ledger` in tab A and `B-still-legacy` in tab B.
6. Reload tab A, reinstall the helper, resume S6-A, and capture `A-legacy-after-reload`.
7. Capture `B-still-legacy-after-A-reload` in tab B.
8. If tab A is not legacy after reload, treat this as a failure and reload again; do not continue.
9. Export both helper records, combine them into one S6 evidence JSON, download, hash, then clean each tab.

### Pass Criteria

- only tab A enters ledger source
- tab B remains legacy throughout
- tab A reload returns tab A to legacy
- neither tab changes the other tab's active/effective source or switch count
- final state in both tabs is legacy with aligned counts and clean diagnostics

## CV3.3-S7 - Session Soak

### Duration

- minimum: 30 minutes
- preferred: 60 minutes

### Procedure

1. Complete the standard entry sequence with a unique S7 ID and run P2.
2. Capture `S7-ledger-start` and record initial counters.
3. During the soak perform normal scrolling, several disposable message submissions, one branch or variant interaction, and one A -> B -> A conversation navigation cycle.
4. Capture bounded read-only snapshots every 5-10 minutes and after each required action. Do not exceed 24 helper snapshots.
5. Record approximate JS heap fields when `performance.memory` or equivalent browser diagnostics are available. Mark heap as unavailable rather than failing when the API is absent.
6. At minimum record deltas for:
   - `identityDriftDetectedCount`
   - `identityDriftPersistentCount`
   - `identityDriftRebuildCount`
   - `coreTurnUpdatedRebuildCount`
   - `totalMismatchCount`
   - `currentMismatchCount`
   - `instrumentationErrorCount`
   - alias conflict gauges
   - quarantined alias count
   - ledger member count
   - MiniMap count
7. Return to the starting conversation, wait ten seconds, and capture `S7-final-ledger-settled`.
8. Roll back to legacy, capture `S7-legacy-restored`, export, download, hash, then clean up.

### Pass Criteria

- no persistent mismatch
- no conflict/quarantine growth
- no uncontrolled or sustained rebuild loop
- no settled count divergence
- exact convergence and dual-run parity at final check
- successful rollback to legacy
- heap evidence is advisory only and not a pass requirement

## Final CV-3.3 Acceptance

Create one summary document and one matrix table referencing exactly one JSON evidence artifact for each S1-S7 scenario. Every artifact must end with active/effective/default source `legacy-durable-cache` and include byte size plus SHA-256. The S1 matrix row must report large-conversation canonical retention and confirm that Pagination Windowing remained disabled; it must not claim multi-page, title-list, divider, or page-collapse coverage.

CV-3.3 may be declared PASS only when every required scenario passes. A partial matrix is not sufficient for default-flip review, a default flip, or unattended rollout. Any default change remains a separate future architecture decision even after a full CV-3.3 pass.
