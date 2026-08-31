# M06 T4.2 — Assembled Disposable-Profile Runtime Evidence Record

| Field | Value |
| --- | --- |
| Lane | 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization |
| Mission | M06 — Reclamation / GC |
| Phase | P4 — Activation & Acceptance |
| Runtime task | T4.2 — disposable-profile assembled runtime proof |
| Closure task | T4.3 — acceptance record / residual disposition / §Z closure |
| Canonical contract | [`docs/systems/archive/saved-chat-reclamation.md`](../../docs/systems/archive/saved-chat-reclamation.md) — Revision 2, HDA ACCEPTED 2026-08-28 |
| Retention decision | `DP-M06-RETENTION-FLOOR` — APPROVED 2026-08-28, default `K = 3` |
| Accepted source HEAD | `f254a00d1ccca72e704b0c9d25c2a26b88245dcf` |
| HEAD subject | `fix(studio): restore occupant quarantine button affordance` |
| Branch | `work/saved-chat-storage` — local, **unpublished** |
| Affordance repair commit | `f254a00d1ccca72e704b0c9d25c2a26b88245dcf` |
| Integration state | no push, merge, tag or integration authorized |
| Evidence type | Real WebKit/Tauri operator-driven assembled runtime proof |
| Product source changed | Only the affordance repair at `f254a00d` (New-UI presentation + one validator pin) |

**Status:** T4.2 **COMPLETE** · T4.3 evidence preparation · **G3 NOT REACHED** ·
**P4 NOT COMPLETE** · **M06 NOT COMPLETE**

This record closes the durable-evidence half of **AC-M06-11**. It is an evidence
index, not a transcript: underlying step-by-step proof lives in the Supervisor
prompt chain (Prompts 50–96), referenced by checkpoint below.

## 1. Assembled build and isolation

| Item | Value |
| --- | --- |
| Sealed repaired executable | `sha256-5c0b936606763b2446898dcc7621888941b7cfd560584b764f4fb75ef2dd0eec` |
| Bundle path | `apps/studio/desktop/src-tauri/target/release/bundle/macos/H2O Studio.app/Contents/MacOS/h2o-studio-desktop` |
| Isolation mechanism | explicit disposable `HOME`; Tauri `app_local_data_dir()` derives from `$HOME` on macOS |
| Canonical identifier | `org.h2o.studio.desktop` — unchanged; no test-only identifier overlay was used |
| Live-`HOME` verification | read from the live process environment at every checkpoint, never assumed |
| Production descriptors | **zero** under `/Users/hobayda/Library/**` at every checkpoint (`lsof`) |
| Production metadata | unchanged throughout: `studio-v1.db` mtime `2026-08-28T22:38:23`; `archive/` mtime `2026-06-24T13:06:10` |
| Startup behaviour | guarded relaunches performed **no** automatic M06 mutation — seeded fixtures, receipts and inodes were byte-identical across every restart boundary |

The runtime evidence location was a disposable root under the OS temporary
directory. That root was **subsequently purged externally** (§8) and no longer
exists; nothing in this record depends on its continued existence.

## 2. T4.2 assembled-runtime branches

| # | Branch | Result | Checkpoint |
| --- | --- | --- | --- |
| A | assembled app against isolated disposable HOME | PASS | P54–P58 |
| B | startup performs no automatic M06 mutation | PASS | P68, P80 |
| C | trusted retention K=3 Analyze/reclaim behaviour | PASS | P66 |
| D | protected generations preserved | PASS | P66–P83 |
| E | generation reclamation | PASS | P67 |
| F | restart durability | PASS | P68 |
| G | generation-staging / durable-temp residue identification and cleanup | PASS | P69–P72 |
| H | canonical CAS physically untouched | PASS | all checkpoints |
| I | occupant Partial classification + trusted UI hint | PASS | P73–P74 |
| J | New-UI occupant-control affordance | PASS after repair `f254a00d` | P75–P78 |
| K | occupant quarantine | PASS | P82 |
| L | one-run occupant dwell | PASS | P82 |
| M | later-run occupant convergence | PASS | P83 |
| N | no timestamp / age authority | PASS | P83 |
| O | stale-VALID fresh-backend refusal | PASS | P90–P95 |

## 3. Destructive-action evidence

Every destructive action produced durable receipts under
`archive/.h2o-reclaim/receipts/`. Eleven evidence files existed at peak in the
original profile.

### 3.1 Generation reclamation — `run-372b671468f87179cdb2490864d1ccfb`

Synthetic chat `t42-m06-seed-0001`, four generations published through the real
trusted publisher via the governed request path.

| Snapshot | Generation `contentHash` | Outcome |
| --- | --- | --- |
| s04 (head) | `028a8e623612f6ccd7c45ac1030c9a6b234b9230415bc0be10e540f7568512e1` | Protected |
| s03 | `65ebe0a48ed136c6a49a002370ab3b8219d79424410e0543f23bd95096d21fd0` | Protected |
| s02 | `48768c3983762b1b6fe10e67656ccb2ee36495a42f64140d14f649ef79f6bb58` | Protected |
| s01 | `4bf0a214cb7cc387fc313d281b357cee26613b1c53e401b0cda9b4fd5453ff69` | **Reclaimed** |

Exactly one generation — the single entry below the `K = 3` floor — was
quarantined and purged. Receipts: `…plan.json`, `….quarantined.json`,
`….purged.json`. The three protected packages remained byte-identical across
all twelve member digests for the remainder of the campaign.

### 3.2 Staging / durable-temp residue — `run-81967bd5cedd1736253b230861759be8`

Two source-faithful residue families were seeded and reclaimed:

| Family | Tag | Seeded object |
| --- | --- | --- |
| `GenerationStaging` | `genstage` | `packages/.h2o-genstage-000000000000074200` (directory) |
| `DurableTemp` | `durtmp` | `assets/aa/.h2o-durable-742-0.tmp` (regular file) |

Both were quarantined and purged in the same governed Reclaim; residue
converged to **0**. Four receipts (quarantined + purged per family) plus the run
plan. No live or in-flight state was removed.

### 3.3 Occupant quarantine — `run-af6fc03ee0d0bef5cf255d5ba794d919`

A generation-shaped empty directory at the former-s01 path classified
`Indeterminate{Partial}` and surfaced the trusted remedy action.

- Backend re-classified under `ExclusiveOwnership` with a fresh package scan.
- Item atomically renamed into the run's quarantine namespace; **inode
  `391874666` preserved**, proving `rename(2)` rather than copy-and-delete.
- Receipts: `…plan.json` and `….occupant-quarantined.json`, recording
  `dwell: "one-run"`, `purged: false`, `purgeInThisRun: false`,
  `classification: "partial"`, and all four preconditions true.
- **No purge receipt was written in this run.**

### 3.4 One-run dwell

After RUN N completed, the quarantined occupant remained physically present at
its original inode, mode and mtime, with zero receipts claiming purge. The
quarantine receipt was never rewritten to assert a purge that did not occur.

### 3.5 Later-run convergence

The next governed Reclaim consumed the previous-run occupant.

| Item | Value |
| --- | --- |
| Recovery record | `recovery-27345c1aef0bdb1a2729c656f0d616e5.recovery.json` |
| Recovery id | `run-27345c1aef0bdb1a2729c656f0d616e5` |
| Stage | `stale-quarantine-recovery` |
| Result | `state: "converged"`, `purged: 1`, `blockers: []`, `unattributable: []` |
| Attributed to | `run-af6fc03ee0d0bef5cf255d5ba794d919`, kind `occupant` |
| UI report | `state: no-op` · `stale entries recovered 1` |

Inode `391874666` was released and had no live path anywhere under the
disposable root. The prior run namespace returned to zero entries. The ten
historical receipts remained byte-identical — recovery was purely additive.

**Why the run reported `no-op`:** recovery executes before the fresh
reclamation plan is computed, and the plan had no candidates, so the run
returned the truthful no-op with `run_id: None` and minted no namespace. The
recovery work is carried in the same outcome as `recovered: 1`.

## 4. Stale-VALID refusal (acceptance-critical)

Rebuilt publisher-issued package **P′**:

| Item | Value |
| --- | --- |
| Basename | `t42-m06-stale-valid-0001.gae8e96236a7b146b18164052a8ea9873966c6aa9f39017fbb27c2c40d4ee3df3.h2ochat` |
| Content hash | `sha256-ae8e96236a7b146b18164052a8ea9873966c6aa9f39017fbb27c2c40d4ee3df3` |
| Publisher inode at final proof | `392339450` |
| `manifest.json` | `4669916d1414966bbe3a62611ffaaabd87ad883e303b32a4fc40c657fe1170cc` |
| `snapshot.json` | `ae8e96236a7b146b18164052a8ea9873966c6aa9f39017fbb27c2c40d4ee3df3` |
| `chat.md` | `d2e249da256bd248298ba448fa1def7ccf278a0aa49746b5757ac037b82f4433` |
| `chat.html` | `ccfdd0fdd1323072dc21d679f3058223d97de1724d4b1c2bb29770f6512d0fd4` |

`contentHash == SHA-256(snapshot.json)` because `assets` is empty and
`payloadVersion` is 1 — the v1 derivation. The basename hash, the manifest
`contentHash`, the stored request-row materialization record and the trusted
derived hash all agree.

Proof sequence:

```
Partial occupant at P′                      (empty directory, inode 392344932)
  → human Analyze                            → row rendered excluded / indeterminate
                                                with `Quarantine occupant…`
  → Analyze verified read-only               → `.h2o-reclaim` was never created
  → Partial object moved aside               → preserved, inode 392344932, still empty
  → exact publisher-issued VALID P′ restored → inode 392339450, four digests identical
  → NO second Analyze, NO Run diagnostics
  → stale occupant action clicked once
  → backend fresh scan under ExclusiveOwnership → VerifiedGeneration
  → state: refused
     blocker: occupant-is-a-verified-generation
```

The refusal returns on the first branch of the fresh verdict — **before**
`archive_path` is captured and before the packages directory is opened — so no
rename, namespace, plan receipt, quarantine receipt, purge, recovery record or
CAS action is reachable.

After the refusal: P′ byte-identical at inode `392339450`;
`archive/.h2o-reclaim` still absent entirely; zero run namespaces; zero occupant
items; zero receipts of any kind; zero recovery records; CAS objects 0; residue
0; store and request queue unchanged.

**Conclusion: THE PREVIEW HINT GRANTS NO DESTRUCTIVE AUTHORITY.**

## 5. Affordance repair history

T4.2 discovered that the occupant remedy control shipped **inert**:

- The control already existed as a real `<button>` with trusted hint gating and
  a bound click listener — the wiring was correct.
- `studio.css` applies a global reset (`button { border:0; background:none;
  color:inherit }`), which stripped the control of every visual affordance, so
  it rendered as unstyled text and read as non-interactive.
- The repair restored visible border, background, padding and pointer cursor
  using the existing Studio button convention already used by the sibling
  Archive Health / Materializer controls. Presentation only.
- The focused activation validator gained regression pin **check 6a**
  (`tools/validation/studio/validate-saved-chat-reclamation-activation-v1.mjs`),
  asserting the control is an operable `<button type="button">` carrying an
  explicit style with a pointer cursor, non-reset border/background, and
  padding.
- The pre-repair unstyled form was independently confirmed to **fail** the new
  pin, so the pin is regression-proof rather than tautological.
- Focused VER passed; committed locally as
  `f254a00d1ccca72e704b0c9d25c2a26b88245dcf`.

**No destructive-authority semantics changed.** The trusted side already
re-derived and re-classified its target; only the control's visibility changed.

## 6. Boundary records

### 6.1 CAS boundary

- Canonical CAS was **analysis-only** throughout T4.2.
- Canonical `sha256-*` objects remained **0** at every assembled checkpoint.
- No Reclaim, quarantine, purge or recovery path removed, renamed or mutated a
  content-addressed object.
- **AC-M06-02** forbids CAS mutation; §H states the negative invariant and §P
  lists physical CAS reclamation as an explicit no-go.
- Physical CAS reclamation was narrowed out of M06 by Revision 2 and remains a
  **deferred seam** requiring a future explicit authority and Decision Point,
  plus a new destructive evidence gate.

**Physical CAS garbage collection was NOT implemented in M06.**

### 6.2 No-timestamp authority

- Retention ordering uses verified in-content `snapshot.savedAt` with a
  deterministic `contentHash` tiebreak — never a filesystem timestamp, never
  wall-clock age.
- One-run occupant dwell is **structural**: the recovery pass runs before the
  fresh run id is minted, so every namespace it can see is by construction a
  previous run. A run cannot purge the occupant it is about to quarantine.
- The recovery module contains no `SystemTime`, `Instant`, `UNIX_EPOCH`,
  `now()`, `elapsed`, `modified()`, `Duration` or `chrono` usage, and reads no
  mtime, ctime or age criterion.

**Conclusion: ONE-RUN DWELL IS STRUCTURAL, NOT TEMPORAL.**

### 6.3 Collateral change

No migration allocated (D9 respected). Live v3 remained OFF and was not
activated as a side effect. No Chrome architecture change, no Sync-owned
change, no schema change. New UI only.

## 7. Acceptance criteria (§O)

| Criterion | Verdict | Anchor |
| --- | --- | --- |
| AC-M06-01 Floor invariance | PASS | §3.1 — `K = 3`, exactly one sub-floor entry reclaimed |
| AC-M06-02 No CAS mutation | PASS | §6.1 — canonical CAS 0 at every checkpoint |
| AC-M06-03 Enforced single-instance | PASS | `ExclusiveOwnership` per command, `flock(LOCK_EX\|LOCK_NB)`, fails closed |
| AC-M06-04 Crash convergence | PASS | §3.4–3.5 — dwell then `converged`, no half-deleted canonical entry |
| AC-M06-05 M05 preservation | PASS — see caveat | no M05 path modified; publisher/verifier reused verbatim; renderer still holds no `fs:allow-remove`/`rename` under `archive` |
| AC-M06-06 No timestamp authority | PASS | §6.2 |
| AC-M06-07 Renderer-input monotonicity | PASS — see caveat | §F; pinned in `archive_retention_plan/tests.rs` and `archive_reclamation_preview/tests.rs` |
| AC-M06-08 Trusted DB probe | PASS | `archive_db_probe`; Analyze reported *Database probe: complete*; failure blocks dependent stages |
| AC-M06-09 Staging reclamation soundness | PASS | §3.2 — both families reclaimed, no live state removed |
| AC-M06-10 Occupant action safety | PASS | §3.3, §4 — only Corrupt/Partial/IdentityMismatch/Unreadable admitted, under dwell |
| AC-M06-11 Evidence completeness | **PASS with this durable evidence record** | receipts covered every destructive action; §1–§6 record the assembled proof durably |
| AC-M06-12 No collateral change | PASS | §6.3 |
| AC-M06-13 Destructive gate ordering | PASS | G02 passed before T4.2; destructive commands unregistered and destructive UI unavailable until then |

**Caveat carried for G3.** AC-M06-05 and AC-M06-07 were sealed at earlier gates
(G1′ / G2). T4.3 located their pin sites and confirmed no M05 path was modified,
but **did not re-execute those pins**. G3 should independently re-run the M05
negative pins and the renderer-input monotonicity pins rather than inheriting
this assertion.

## 8. Historical disposable-profile purge

A macOS update/restart externally purged `/private/tmp` across the
2026-08-30 → 2026-08-31 boundary, destroying the original disposable runtime.

- Root cause proved from inode and mtime evidence: `/private/tmp` itself had
  been recreated, every 2026-08-30 inode was absent, and the oldest surviving
  mtime anywhere under the session root was from the following morning.
- The relaunched application correctly opened the same explicit `HOME` path and
  created a **fresh empty profile**; the UI truthfully reported zero chats.
  This was neither a UI refresh defect nor a product defect.
- No production alias and no production mutation occurred.
- No contradiction with any previously sealed T4.2 finding was found. The
  already-accepted branches (retention, reclamation, restart durability,
  residue, occupant quarantine, dwell, convergence, affordance repair) remain
  accepted and were **not** re-run.
- Only the stale-VALID branch was rebuilt and re-proven (§4). The synthetic
  inputs were regenerated **byte-identically**, verified against their sealed
  digests. The publisher-issued basename necessarily differed, because
  `snapshot.savedAt` is the import wall-clock and therefore changes the
  `contentHash` — the documented determinism model, not a defect.

**Environment lesson (not an M06 defect):** long-lived acceptance fixtures
should not rely on OS temporary storage.

## 9. Residual disposition

| # | Residual | Safety | Destructive authority | User-visible | Disposition |
| --- | --- | --- | --- | --- | --- |
| 1 | Desktop import reporting mismatch — success renders `0 imported, 0 snapshots` | none | not affected | yes, misleading totals | **ACCEPT FOR M06 / FOLLOW-UP** |
| 2 | Processed request delivery re-scan / projection-sensitive dedupe collision | fails closed; existing `written` request and published generation do not regress | not affected | yes, misleading `db-unavailable` on hazardous re-scan | **ACCEPT FOR M06 / FOLLOW-UP** |
| 3 | Reclamation Preview snake_case/camelCase display mismatch | safety-adjacent display issue, not an authority defect | not affected — trusted Rust plan/re-plan is authoritative and fail-closed | yes | **ACCEPT FOR M06 / DOCUMENTATION FOLLOW-UP + standing evidence rule** |

**Standing evidence rule for residual 3.** The card's multi-word
`sources.*Complete` indicators are `undefined !== false` and therefore
**defaulted to true, not read**. They would display "complete" even if the
trusted side reported incomplete with blockers. **Do not use those indicators
as acceptance authority.** Use `plan.complete`, blocker state, or the actual
candidate/protected outcomes — all of which are single-word keys that render
correctly. The fail-closed guarantee is unaffected: `plan.complete =
blockers.is_empty()`, every Candidate downgrades to Protected before totals are
computed, and the destructive path re-plans under exclusive ownership and
refuses `PLAN_NOT_AUTHORITATIVE` on an incomplete plan.

None of the three affects destructive authority, and none blocks closure.

## 10. UX / structure candidates (not canonical residuals)

**A — stale Analyze decision list remains visible after an occupant action.**
The occupant handler updates only the result pane and disarms Reclaim; the
decision rows live in a separate node written solely by Analyze. §K's
`Analyze → review → confirm → Reclaim` chain is intact because Reclaim is
disarmed, and the backend re-plans regardless. T4.2 branch O depended on this
behaviour to construct the proof.
→ **NOT A DEFECT / AS-DESIGNED for M06**; optional UX/documentation follow-up
on whether the panel should mark itself stale.

**B — reclamation card lifecycle under a health-card rerender.**
`mountReclamationCard` is the only card that appends **inside** the health
container; the inspector, importer, exporter and materializer cards all insert
as true DOM siblings. The health card's rerender clears that container, so
clicking *Run diagnostics* destroys the reclamation card with no remount.
→ **DOCUMENTATION / UX FOLLOW-UP**; recommended first post-M06 UI fix (adopt
the same sibling mount the other four cards already use). Grants no authority,
alters no acceptance criterion, **not a closure blocker**.

Neither candidate is promoted to canonical residual status.

## 11. §Z mission-boundary record

M05 §Z ([`docs/systems/archive/saved-chat-generations.md`](../../docs/systems/archive/saved-chat-generations.md), *Z. Mission boundaries*)
assigned to M06: stale-generation pruning, staging-residue reclamation, CAS
garbage collection, and any delete authority — while honouring §F's
content-stale vs format-stale distinction and §C's grandfathering.

| §Z assignment | Disposition |
| --- | --- |
| stale-generation pruning | **DISCHARGED** — §3.1 |
| staging-residue reclamation | **DISCHARGED** — §3.2 |
| delete authority | **DISCHARGED through trusted Rust only** |
| content-stale / format-stale + grandfathering | **HONOURED** — §E protects format-stale and grandfathered legacy packages explicitly |
| CAS garbage collection | **RE-DEFERRED** by the later HDA-accepted M06 Revision 2 |

**Stronger safety outcome than §Z anticipated.** M05's §Z-linked G1 prerequisite
noted that its legacy destructive overwrite path is inert only because the
capability withholds `fs:allow-remove`, and that §Z assigns remove authority to
M06 — "precisely the milestone that would grant it". **M06 did not grant it.**
`capabilities/archive-cas.json` still carries no remove or rename permission
over `$APPLOCALDATA/archive`, and §P forbids ever introducing one. Delete
authority was delivered entirely in trusted Rust, so that legacy path remains
inert.

Physical CAS reclamation remains forbidden until a future explicit authority
satisfies the Revision-2 prerequisites and passes a new destructive evidence
gate.

**§Z mission assignment is CLOSED-IN-PART BY DESIGN; physical CAS GC is
formally deferred and must be reassigned by future authority.**

## 12. Status and G3 boundary

| Item | State |
| --- | --- |
| T4.2 | **COMPLETE** |
| T4.3 | evidence record prepared; residuals dispositioned; §Z recorded |
| G3 | **NOT REACHED** |
| P4 | **NOT COMPLETE** |
| M06 | **NOT COMPLETE** |

The G3 independent reviewer must still verify:

1. this committed evidence artifact;
2. **AC-M06-05** — M05 negative pins, re-executed independently;
3. **AC-M06-07** — renderer-input monotonicity pins, re-executed independently;
4. **residual 3** — the authority/display boundary and the standing evidence rule;
5. **§Z** — formal future reassignment of physical CAS garbage collection;
6. final evidence completeness across the mission.

No Mission acceptance is claimed by this record. Acceptance of M06 requires the
independent G3 decision and Human Decision Authority; the mission-level
acceptance artifact belongs after that decision, not here.

## 13. Boundaries held

No production state was read for content, mutated or deleted at any point;
production was inspected by path and `stat` metadata only. No capability was
broadened. No SQLite schema, migration, Sync, transport or Chrome change. No
live-v3 activation. No cross-Lane worktree reuse. The branch remains local and
unpublished, and no push, merge, rebase, tag or integration was performed.
