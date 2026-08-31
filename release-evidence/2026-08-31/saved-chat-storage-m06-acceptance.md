# M06 — Saved-Chat Archive Reclamation / GC — Acceptance Record

Date: 2026-08-31

Lane: 🗃️ L-SAVED-CHAT-STORAGE — Mission M06

Status: **COMPLETE / ACCEPTED**

Accepted candidate: `4b38f076b86db7e533c9baf459eea3769e4dbd51`
(`docs(evidence): record M06 T4.2 assembled runtime proof`)

G3 acceptance date: 2026-08-31

## 1. Mission identity

Mission M06 — Governed Reclamation / GC of saved-chat archive storage.
Canonical contract:
[Saved Chat Archive Reclamation — Governed GC Contract](../../docs/systems/archive/saved-chat-reclamation.md),
**Revision 2 — HDA ACCEPTED 2026-08-28**, with
**`DP-M06-RETENTION-FLOOR` — APPROVED 2026-08-28**, default `K = 3`, structural
range `K >= 1`, `K = 0` invalid.

Accepted at candidate `4b38f076b86db7e533c9baf459eea3769e4dbd51` following
independent G3 final acceptance on 2026-08-31.

## 2. Accepted scope

| Phase | Subject | State |
| --- | --- | --- |
| P0 | Contract & Decision | COMPLETE |
| P1 | Non-destructive Foundations | COMPLETE |
| P2 | Read-only Engine | COMPLETE |
| P3 | Destructive Core — dormant / unregistered | COMPLETE |
| P4 | Activation & Acceptance | **COMPLETE** |

| Gate | Subject | Result |
| --- | --- | --- |
| G0 | canonical contract plus accepted `DP-M06-RETENTION-FLOOR` | passed |
| G1′ | non-destructive foundations without M05 or security regression | passed |
| G2 | read-only engine, fail-closed and monotonicity proof | passed |
| G02 | standing HDA destructive activation gate | passed |
| G3 | final M06 acceptance and evidence closure | **PASS** |

| Task | Subject | State |
| --- | --- | --- |
| T4.2 | disposable-profile assembled runtime proof | **COMPLETE** |
| T4.3 | acceptance record / residual disposition / §Z closure | **COMPLETE** |

Functional Core is achieved. Required M06 work remaining: **None**.

## 3. Final implementation authority

The accepted work is the 18-commit local M06 chain from the contract commit
`5481c344` through `4b38f076`, spanning 40 paths, with **no merge commits**:

`5481c344` → `3bc6ac13` → `4bf8e5f5` → `ab0128d7` → `e47b7b78` → `b5fd9178` →
`2782e6a9` → `a10fe915` → `bb2a1d5b` → `745719dc` → `a6d699e4` → `f34fd73f` →
`0f37d426` → `7834b547` → `b3497bfb` → `7ffe06e0` → `f254a00d` → `4b38f076`

`7ffe06e0` is the activation commit; `f254a00d` is the occupant-control
affordance repair found and fixed during T4.2; `4b38f076` records the durable
assembled-runtime evidence.

The local branch is **unpublished**: `origin/work/saved-chat-storage` remains
`17a86e953d38ac35081a1f83c177134b4c0d0039`, and `origin/main`
(`7944f23beb74edccc01c42ceae396291833fc071`) remains unintegrated.

## 4. Final assembled runtime proof

Full evidence:
[M06 T4.2 assembled runtime evidence record](saved-chat-storage-m06-t42-assembled-runtime-evidence.md)
— `sha256-0bf32a35b7a2b8e462a3fc9ca986562a6d8177cdd67109cbb4765a2a28baa69e`,
committed at `4b38f076`.

That artifact closes **AC-M06-11**'s durable assembled-evidence requirement and
is not reproduced here. It records an isolated real Desktop instance — explicit
disposable `HOME`, sealed executable
`sha256-5c0b936606763b2446898dcc7621888941b7cfd560584b764f4fb75ef2dd0eec`,
zero production descriptors — demonstrating all fifteen T4.2 assembled-runtime
branches (A–O) as PASS.

## 5. Acceptance criteria

| Criterion | Subject | Result |
| --- | --- | --- |
| AC-M06-01 | Floor invariance | PASS |
| AC-M06-02 | No CAS mutation | PASS |
| AC-M06-03 | Enforced single-instance proof | PASS |
| AC-M06-04 | Crash convergence | PASS |
| AC-M06-05 | M05 preservation | PASS |
| AC-M06-06 | No timestamp authority | PASS |
| AC-M06-07 | Renderer-input monotonicity | PASS |
| AC-M06-08 | Trusted DB probe | PASS |
| AC-M06-09 | Staging reclamation soundness | PASS |
| AC-M06-10 | Occupant action safety | PASS |
| AC-M06-11 | Evidence completeness | PASS |
| AC-M06-12 | No collateral change | PASS |
| AC-M06-13 | Destructive gate ordering | PASS |

## 6. Independent acceptance audit

G3 independently re-executed the two criteria that T4.3 had explicitly deferred
rather than asserting, and both passed.

**AC-M06-05 — M05 preservation / negative pins**

| Focused run | Result |
| --- | --- |
| `the_renderer_holds_no_archive_mutation_authority_after_the_g1_cutover` | 1 passed |
| `archive_generation_publish` | 80 passed / 0 failed |
| `archive_durable_write` | 32 passed / 0 failed |

**AC-M06-07 — renderer-input monotonicity / fail-closed authority**

| Focused run | Result |
| --- | --- |
| `renderer_evidence_is_enabling_only_and_monotonic` | 1 passed |
| `incomplete_trusted_inputs_block_authoritative_candidates` | 1 passed |
| `removing_renderer_information_never_grows_the_acted_set` | 1 passed |
| `no_hostile_renderer_input_can_reduce_the_structural_floor` | 1 passed |
| `an_incomplete_db_probe_refuses_before_any_mutation` | 1 passed |
| `archive_retention_plan` | 20 passed / 0 failed |
| `archive_reclaim_execute` | 55 passed / 0 failed / 2 ignored |

G3 also independently verified that the residual display mismatch (§9.3) cannot
broaden destructive authority.

**G3 verdict: PASS — independent final acceptance.**

## 7. Key acceptance conclusions

**Retention.** The `K = 3` floor is accepted. Protected-generation invariance
passed: no reclamation path reduced a chat below its protected set, and `K`
functions as a floor only — exceeding it never authorized deletion on that
basis alone.

**CAS.** The canonical CAS remained non-mutating under M06 throughout;
canonical object counts stayed at zero across every assembled checkpoint.
**Physical CAS garbage collection was NOT implemented.** Physical CAS
reclamation remains a deferred seam under Revision 2 §H.

**Occupant authority.** The governed occupant action is limited to eligible
non-VALID occupant classes (corrupt, partial, identity-mismatched, unreadable).
The backend always freshly reclassifies under exclusive ownership. The
stale-VALID test — a Partial occupant analyzed, then replaced behind the
displayed action by the exact publisher-issued VALID generation with no second
Analyze — returned `occupant-is-a-verified-generation` and mutated nothing.
**The Preview/UI hint grants no destructive authority.**

**Dwell and recovery.** One-run occupant dwell proven; later-run convergence
proven through the pre-run recovery pass. Dwell is **structural, not temporal**:
recovery executes before a fresh run id is minted, so every namespace it can see
is by construction a previous run. No mtime, ctime, elapsed duration or age
criterion grants purge authority anywhere.

**M05 preservation.** Renderer archive destructive capability remained withheld
— the archive capability still grants no `fs:allow-remove` or `fs:allow-rename`
over `$APPLOCALDATA/archive`, and the M06 chain changed no capability file. The
M05 legacy destructive overwrite path therefore remains inert.

## 8. State-integrity / safety boundaries

- Production `studio-v1.db` contents were **never opened** during the isolated
  acceptance proof; production was inspected by path and `stat` metadata only.
- Production application state, real `H2O Studio Exports`, real
  `H2O Studio Archive Requests` and real `H2O Studio Sync` all remained
  unchanged.
- **No M06 migration was allocated.** Source migration authority remains
  **v17**, and the external production v18–v21 D9 constraint is respected.
- Renderer archive mutation authority remains **empty**.
- **Live v3 remains OFF**; M06 did not activate it as a side effect.
- New UI only. No Chrome architecture change, no Sync-owned change.

## 9. Residual dispositions

Carried unchanged from T4.3. None affects destructive authority; none blocked
closure.

**9.1 Desktop import reporting mismatch** — a successful Desktop import renders
`0 imported, 0 snapshots` because the summary reads an incompatible result
shape. Display-only; the trusted store proved the writes succeeded.
→ **ACCEPT FOR M06 / FOLLOW-UP**

**9.2 Processed request delivery re-scan / projection-sensitive dedupe
collision** — a processed delivery file remains in the inbox; re-scanning after
the projection moves recomputes the effective dedupe key against a fixed
`requestId` and reports `db-unavailable`. Fails closed: the existing `written`
request and its published generation do not regress.
→ **ACCEPT FOR M06 / FOLLOW-UP**

**9.3 Reclamation Preview snake_case/camelCase display mismatch** — the
Preview envelope is snake_case while the New-UI card reads camelCase, so
multi-word fields render blank or defaulted. Safety-adjacent display issue, not
an authority defect.
→ **ACCEPT FOR M06 / DOCUMENTATION FOLLOW-UP + STANDING EVIDENCE RULE**

> **Standing evidence rule.** Do **not** use the card's defaulted multi-word
> completeness indicators as acceptance authority. Use trusted `plan.complete`,
> blocker state, the actual protected/candidate decisions, and the fresh
> execution re-plan.

## 10. UX / structure follow-ups

Recorded separately from the canonical residuals; neither is an acceptance
failure.

**A. Stale Analyze decision list after an occupant action.** The action result
updates while the previously rendered Analyze rows remain visible as the
pre-action snapshot. Reclaim is disarmed, so the stale view is not execution
authority.
→ **NOT A DEFECT / AS-DESIGNED FOR M06**; optional UX/documentation follow-up.

**B. Reclamation card lifecycle under an Archive Health rerender.** The
reclamation card mounts inside the health container, which the health card can
clear on rerender, destroying the card rather than remounting it.
→ **DOCUMENTATION / UX FOLLOW-UP**; recommended post-M06 UI fix. Not a
destructive-authority issue and not an M06 closure blocker.

## 11. §Z mission-boundary disposition

M05 §Z ("Mission boundaries",
[Saved Chat Archive Generations Contract](../../docs/systems/archive/saved-chat-generations.md),
dated 2026-08-26) forward-assigned GC/reclamation to M06. M06 Revision 2 was
HDA-accepted on 2026-08-28 — the later mission-owning authority narrows that
historical forward assignment.

| §Z assignment | Disposition |
| --- | --- |
| stale-generation pruning | **DISCHARGED** |
| staging-residue reclamation | **DISCHARGED** |
| delete authority | **DISCHARGED through trusted Rust only** |
| content-stale / format-stale distinction and grandfathering | **HONOURED** |
| physical CAS garbage collection | **RE-DEFERRED by M06 Revision 2** |

**§Z mission assignment is CLOSED-IN-PART BY DESIGN; physical CAS GC is
formally deferred and must be reassigned by future explicit authority.**

Future physical CAS reclamation requires the Revision-2 §H prerequisites, a new
explicit Decision Point, and a new destructive evidence gate.

**M06 did NOT grant renderer `fs:allow-remove` / `fs:allow-rename` authority
over the archive.** Delete authority was delivered entirely in trusted Rust, so
M05's legacy destructive overwrite path remains inert — a stronger outcome than
§Z anticipated. The M05 contract was not modified by M06.

## 12. Environment incident

A macOS update/restart externally purged `/private/tmp` mid-mission, destroying
the original disposable T4.2 runtime. Root cause was proven through inode and
mtime evidence: `/private/tmp` itself had been recreated and no pre-purge inode
survived. The relaunched application correctly opened the same explicit `HOME`
and created a fresh empty profile. No production alias and no production
mutation occurred, no product-source contradiction was found, and every
already-sealed historical finding remained valid. Only the remaining
stale-VALID branch was rebuilt, and its final acceptance passed.

**Environment lesson (not a product defect):** long-lived acceptance fixtures
should not rely on OS temporary storage.

## 13. Explicit non-authorization

Acceptance of M06 does **not** authorize: push; merge; integration of `main`;
release or deployment; physical CAS garbage collection; M07 transport/cloud;
M08 ZIP/container; migration work; Sync changes; live-v3 activation; or any
broadening of renderer archive capability.

Mission acceptance and branch integration are distinct. The branch remains
local and unpublished, and no push, merge, rebase, tag or integration has been
performed.

## 14. Acceptance statement

Independent G3 final acceptance passed on 2026-08-31 at candidate
`4b38f076b86db7e533c9baf459eea3769e4dbd51`.

G3: **PASS**. AC-M06-01 through AC-M06-13: **PASS**. P4: **COMPLETE**.

M06 is **COMPLETE / ACCEPTED**.
