# Claude MVP — Phase 9A-4L live verification

> **Status**: paste-and-run protocol ready. Operator-driven verification pending.
> **Predecessor**: Phase 9A-4 commit `b5c1ec3` (Claude content-script MVP).
> **Successor blocker**: Phase 9A-5 (archive ingestion) cannot start until §10 verdict is GREEN or YELLOW.
>
> **Operator**: Load the extension, walk §1, run §2's helper, paste results into §3, mark §10's verdict. Stop. No code changes in 9A-4L.

---

## 0. Why this is operator-runnable only

Live verification requires:
- An **authenticated** claude.ai Chrome session (the runtime can't synthesize one).
- A **Chrome with the H2O extension loaded** at `apps/extensions/claude/chrome/dev/` — operator-installed via `chrome://extensions → Load unpacked`.
- **DevTools open** with the Console context switched to the H2O extension's content-script context (a two-click operator action).

None of those are reproducible from a CI/agent environment. The protocol below is the operator's checklist; the agent's role is to verify the protocol is well-formed and record the verdict.

---

## 1. Manual setup (one-time)

| Step | Action | Confirm |
|---|---|---|
| 1.1 | `node tools/product/extensions/claude/chrome/build.mjs` already produced `apps/extensions/claude/chrome/dev/{manifest.json, content.js, README.txt}` (verified in 9A-4 build report) | ☐ |
| 1.2 | Open Chrome. Visit `chrome://extensions`. Enable Developer mode (top-right toggle). | ☐ |
| 1.3 | Click **Load unpacked** → select `apps/extensions/claude/chrome/dev/`. The card shows extension ID `pdhldppkggpefneaemodleadcgpmpmnc`. | ☐ |
| 1.4 | Confirm the extension card lists "H2O Claude (Chrome dev stub)" v0.0.1 with no errors. | ☐ |
| 1.5 | Open https://claude.ai/ in a new tab. Log in if not already. | ☐ |
| 1.6 | Open DevTools (Cmd+Opt+I on macOS / Ctrl+Shift+I elsewhere). Switch the Console **context dropdown** (top-left of Console pane) from "top" to **"H2O Claude (Chrome dev stub)"**. | ☐ |
| 1.7 | Verify the boot log appears: `[H2OClaudeMVP] v0.1.0 on claude.ai — call window.H2OClaudeMVP.diagnose() …` | ☐ |

If any of 1.1–1.7 fails: stop and file a 9A-4 regression — do not attempt the verification tests.

---

## 2. Consolidated paste-and-run helper

Paste the following one-liner into the **H2O Claude extension's content-script** Console context (NOT the page's "top" context). It is read-only and exits within milliseconds:

```js
(() => {
  const mvp = window.H2OClaudeMVP;
  const d = mvp?.diagnose?.();
  const turns = mvp?.turns?.() || [];
  return {
    exists: !!mvp,
    version: mvp?.version,
    host: mvp?.host,
    context: mvp?.context?.(),
    scan: mvp?.scan?.(),
    selectorProbes: d?.selectorProbes,
    supportedActions: d?.supportedActions,
    isStreaming: d?.isStreaming,
    project: d?.project,
    sidebarLinkCount: d?.sidebarLinkCount,
    turnCount: turns.length,
    roleCounts: turns.reduce((m, t) => (m[t.role] = (m[t.role] || 0) + 1, m), {}),
    codeTurns: turns.filter(t => t.hasCode).length,
    attachmentTurns: turns.filter(t => t.hasAttachment).length,
    artifactTurns: turns.filter(t => t.hasArtifactRef).length,
    firstTurns: turns.slice(0, 3).map(t => ({
      order: t.order,
      role: t.role,
      text: t.text?.slice(0, 160),
      hasCode: t.hasCode,
      hasAttachment: t.hasAttachment,
      hasArtifactRef: t.hasArtifactRef,
    })),
  };
})();
```

Right-click the output → "Copy object" → paste into §3 under the matching scenario.

Repeat the helper across the **8 URL scenarios** from Phase 9A-2's capture matrix:

| # | Scenario | URL pattern | Setup |
|---|---|---|---|
| **S1** | New empty chat | `/new` | Open `claude.ai/new`, do not type |
| **S2** | Short chat (≤6 turns) | `/chat/<uuid>` | Open any existing short conversation |
| **S3** | Long chat (≥30 turns) | `/chat/<uuid>` | Open any long conversation, scroll to bottom |
| **S4** | Code block | `/chat/<uuid>` | Open a conversation with a code block |
| **S5** | Attachment | `/chat/<uuid>` | Open a conversation with a PDF/image |
| **S6** | Artifact | `/chat/<uuid>` | Open a conversation with a Claude artifact (panel may be closed) |
| **S7** | Project chat | `/projects/<id>/conversations/<uuid>` | Open a conversation inside a project |
| **S8** | Streaming | new prompt | Send a long prompt; run helper while streaming, then again after completion |

---

## 3. Raw results (operator fills)

### S1 — `/new` empty chat
```json
(paste helper output)
```

### S2 — short chat (≤6 turns)
```json
(paste helper output)
```
Visible turn count by eyeball: __operator fills__

### S3 — long chat (≥30 turns)
```json
(paste helper output)
```
Visible turn count by eyeball: __operator fills__
Did scrolling to the top of the list reveal more turns? `☐ yes / ☐ no` (virtualization indicator)

### S4 — code block
```json
(paste helper output)
```
`codeTurns ≥ 1`? `☐ yes / ☐ no`

### S5 — attachment
```json
(paste helper output)
```
`attachmentTurns ≥ 1`? `☐ yes / ☐ no`

### S6 — artifact
```json
(paste helper output)
```
`artifactTurns ≥ 1`? `☐ yes / ☐ no` (note: hypothesis-grade; may still be `0` if Anthropic's artifact aria-label has changed)

### S7 — project chat
```json
(paste helper output)
```
`context.routeKind === "project-chat"`? `☐ yes / ☐ no`
`context.projectId` present? `☐ yes / ☐ no`
`project.projectName` non-null? `☐ yes / ☐ no` (often null — breadcrumb hypothesis)

### S8 — streaming
**While streaming** (paste output captured ~2s after Send):
```json
(paste helper output — expect isStreaming: true)
```
**After completion** (paste output ~2s after Stop disappears):
```json
(paste helper output — expect isStreaming: false; turnCount increased by 1)
```

---

## 4. Per-test verdicts (operator fills)

| # | Test | Expected | Pass / Fail / Partial |
|---|---|---|---|
| T1 | Extension injected: `window.H2OClaudeMVP` exists with `version: "0.1.0"`, `host: "claude.ai"` | Both fields present | ☐ |
| T2 | Context: routeKind matches URL pattern; conversationId/projectId parsed where applicable | All 4 route kinds resolve | ☐ |
| T3 | Diagnose: `selectorProbes.main_present = true`; `composer_present = true` (when composer visible); no throws | Clean diagnostic object | ☐ |
| T4 | Turns: count roughly matches visible turn count on S2/S3; `rolesObserved` shows expected user+assistant split; turn `text` non-empty for >90% of turns | Within ±2 of visible count; unknown role count < 20% | ☐ |
| T5 | Code block detection on S4: `codeTurns ≥ 1` | At least one turn flagged hasCode | ☐ |
| T6 | Streaming on S8: `isStreaming: true` mid-generation, `false` post-completion; turn count increments | Both states observed | ☐ |
| T7 | Sidebar: `sidebarLinkCount > 0` when sidebar visible; no errors when collapsed | Non-zero when expanded; no throw when collapsed | ☐ |
| T8 | Safety: no save button injected; no UI mutation beyond `dataset.h2oClaude*`; Network panel shows no extension-originated requests; Application → Storage shows no extension-originated writes | All four safety checks pass | ☐ |

---

## 5. Safety observations (T8 detail)

Run these once during S2:

| Probe | How | Expect | Result |
|---|---|---|---|
| Save button presence | `document.querySelectorAll('button').length` before vs after page load | No delta attributable to extension | __operator__ |
| Dataset markers | `document.documentElement.dataset` | Contains only `h2oClaudeChromeDev: "loaded"` and `h2oClaudeMvp: "0.1.0"` | __operator__ |
| Network panel | Filter by "claude" then by extension origin | Zero requests originated by the H2O extension | __operator__ |
| Application → Storage → IndexedDB / Local Storage / chrome.storage | Filter by extension ID `pdhldppkggpefneaemodleadcgpmpmnc` | All empty | __operator__ |

---

## 6. Selector hit-rate analysis (operator fills)

From the consolidated helper's `selectorProbes` field across S1–S8, tabulate:

| Probe | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| `role_article` (turn count) | | | | | | | | |
| `main_present` (bool) | | | | | | | | |
| `composer_present` (bool) | | | | | | | | |
| `stop_button_present` (bool) | | | | | | | | |
| `sidebar_nav_present` (bool) | | | | | | | | |

**Critical finding to record**: does `role_article` hit on `[role="article"]` reliably (≥1 per conversation page)? If **NO** on S2/S3/S4, the layered fallback (avatar-marker-based) is doing the heavy lifting — that's the §8 risk to flag below.

---

## 7. Notable findings (operator narrative)

Freeform observations. Examples:
- Did the turn count exactly match? Off by 1 (welcome banner)? Off by N (system messages)?
- Did the role classifier misidentify any turn? Which heuristic kicked in (`data-role` / aria / avatar SVG / user-initials / unknown)?
- Any error in the Console (uncaught exception, claude.ai-side warnings about the extension)?
- Did `isStreaming` ever flicker incorrectly (false during generation, true after)?

Operator notes:
> _operator fills_

---

## 8. Risks confirmed/refuted (rolls up from 9A-1 / 9A-2)

| # | Risk | 9A-1 severity | Status after live test |
|---|---|---|---|
| R1 | Claude redesign breaks selectors | High / High | ☐ confirmed / ☐ refuted |
| R2 | No `data-testid` equivalent — fragile turn boundary | High / High | ☐ confirmed / ☐ refuted (decided by §6's `role_article` hit-rate) |
| R3 | Streaming edge cases | Med / High | ☐ refuted (T6 passes) / ☐ confirmed |
| R5 | Artifacts not detected | Med / High (UX perception) | ☐ confirmed if S6 `artifactTurns = 0` |
| R9 | Performance on large convos | Med / Med | ☐ check S3 — helper response time noticeably slow? |
| R11 | Shadow DOM on artifact panel | (new) | ☐ check S6 — any console errors? |

---

## 9. Pre-existing infrastructure failures NOT caused by 9A-4

(Carry-overs from prior phases; not a 9A-4L blocker if they remain in the same state)

- `validate-identity-phase3_8e-password-integrity` and `…phase3_8f-password-auth-release-gate`: pre-existing content-check on `loader: password/code values must not be written to storage`. Not a Claude concern.
- `validate-identity-background-bundle`: requires pre-built `build/chrome-ext-dev-controls/`. Environment-dependent.
- `validate-identity-phase4_7-production-deployment-gate`: content-check on `\.env`/`identity-provider.local.json` regex.

Confirmed unaffected by 9A-4L? `☐ yes / ☐ no`

---

## 10. Verdict (operator picks exactly one)

Mapping rules:

- **GREEN — Ready for 9A-5 archive ingestion** ⟸ ALL of:
  - T1 + T2 + T8 PASS
  - T3's `selectorProbes` reports `main_present: true` AND `composer_present: true` on a fresh conversation
  - T4 turn count matches ±2 of visible turns on S2 AND S3
  - T4 role classification: < 20% of turns are `'unknown'`
  - T6 streaming: BOTH `isStreaming:true` mid-generation AND `:false` post-completion observed
  - T5 code-block detection: at least one `hasCode: true` on S4
  - No exceptions thrown in Console across §3
  - Safety §5 all pass

- **YELLOW — Selectors partly work; fix 9A-4 before ingestion** ⟸ ANY of:
  - T4 turn count off by > 2 from visible on S2 / S3 / S4
  - T4 role classification: > 20% `'unknown'`
  - T5 code-block detection: 0 on S4 despite visible code block
  - T6 streaming: only ONE of the two states observed
  - T7 sidebar: errors thrown when sidebar collapsed
  - S6 artifacts: 0 detected (deferred to 9A-5+ regardless, but flag in notes)

- **RED — Injection or turn detection broken; stop and revisit strategy** ⟸ ANY of:
  - T1 fails (extension not injected or window.H2OClaudeMVP missing)
  - T2 fails on the `/chat/<uuid>` URL (URL regex broken)
  - T3 reports `main_present: false` on a fresh conversation page (architecture has fundamentally changed)
  - T8 fails (safety violation — extension wrote to storage, made a network request, or injected UI)
  - Any uncaught exception in the Console caused by the H2O extension

Operator verdict: ☐ GREEN / ☐ YELLOW / ☐ RED
Operator justification (2–3 sentences):
> _operator fills_

---

## 11. Next step

| Verdict | Next phase |
|---|---|
| GREEN | Open **Phase 9A-5 — Claude archive ingestion**. The MVP read path is stable enough to wire into MSG_ARCHIVE / Studio with `host='claude.ai'`. |
| YELLOW | Open **Phase 9A-4b — selector refinement**. Patch [src/extensions/claude/chrome/scripts/content.js](../../src/extensions/claude/chrome/scripts/content.js) + [packages/host-adapters/claude/src/selectors.js](../../packages/host-adapters/claude/src/selectors.js) in lockstep (mirror sync). Re-run 9A-4L. |
| RED | Hold the Claude rollout. Convene with `docs/architecture/CLAUDE_DOM_NOTES.md` §6 selector table to re-evaluate strategy. May require Phase 9A-2 re-run on the current claude.ai. |

---

## 12. Doc version

| Phase | Date | Author | What changed |
|---|---|---|---|
| 9A-4L v1 | 2026-05-20 | agent (protocol scaffolding) | Created paste-and-run protocol; §3–§10 await operator runs. |
