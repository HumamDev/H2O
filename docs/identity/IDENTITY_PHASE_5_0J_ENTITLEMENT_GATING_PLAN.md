# Phase 5.0J — Pro Entitlement / Feature Gating Plan

> **Status: FUTURE / BLOCKED BY BILLING ACTIVATION.**
> This document captures locked-in design decisions for entitlement gating.
> **No code has been written.** Implementation is deferred until after Phase
> 5.0I billing UI is activated. Activating gates before users have a working
> upgrade path would surface limits with no remediation, which is unacceptable
> UX. This plan is forward-only; revisit and refine before 5.0J-A starts.

## Why this exists

Phase 5.0I added dormant mobile billing — entitlement read, checkout/portal
actions, and a `MOBILE_BILLING_VERIFIED` master switch. The next natural
question is: **what does Pro actually unlock?** This document answers that,
locks in the v1 limits, and defines the architecture before any code is
written.

## Hard dependency on Phase 5.0I activation

5.0J **must not activate before 5.0I-E** (billing UI flag flip). Reasoning:

- A Free user hitting "5/5 folders" must have a tappable "Upgrade to Pro"
  path — that path is the `account-billing` screen, which only routes from
  Settings when `MOBILE_BILLING_VERIFIED === true`.
- Gates without an upgrade path = walls. Walls without an exit = bad UX.
- 5.0J's master switch (see "Activation gate" below) MUST inherit
  `MOBILE_BILLING_VERIFIED` so the two activate together — or 5.0I activates
  first.

**Sequencing rule:** `5.0I-E ≤ 5.0J-E` strictly.

## Locked-in decisions

1. **Quantity-only gating for v1.** No feature is invisible to Free users in
   v1; some features just have count limits. Feature-visibility gating
   (Smart Highlights hidden, etc.) is deferred to a later phase.
2. **More generous early limits** than the original draft, to reduce friction
   during early-tester feedback collection. See "Final limit matrix" below.
3. **Module location:** all entitlement utilities live under
   `apps/studio-mobile/src/billing/` alongside `BillingContext`. No new
   top-level directory.
4. **Extension/browser gating is deferred** until Control Hub is explicitly
   back in scope. Most extension gates land on Control-Hub-adjacent scripts
   that are off-limits parallel work for current sessions. Mobile-only
   gating ships first; extension follows when Control Hub re-opens.
5. **Client-side gating only.** RLS already enforces per-user data
   isolation. Quantity limits are UX guards, not security guards. Backend
   enforcement (a `check_entitlement_limit` RPC) is a v1.5+ enhancement,
   not blocking.
6. **Master switch reuses `MOBILE_BILLING_VERIFIED`.** No new flag. When
   billing is dormant, all gates pass through `allowed: true` regardless of
   tier. When billing activates, gates engage.

## Final limit matrix (v1)

| Resource | Free limit | Pro |
|---|---|---|
| Folders | **5** | unlimited |
| Labels | **20** | unlimited |
| Tags | **15** | unlimited |
| Pinned chats | **10** | unlimited |
| Imported ChatGPT links (lifetime) | **10** | unlimited |
| Archived chats stored | **100** | unlimited |

Limits are **per-user, globally**. Cross-device — a folder created on mobile
counts the same as one created on extension. Numbers are intentionally
generous so Free users can meaningfully evaluate the product before hitting a
limit. Adjust based on real-world feedback after 5.0J-C QA.

All other features (identity, auth, MiniMap core navigation, themes,
Settings, Account, Billing UI, basic export) remain **fully unlocked for
Free**. The product is "Cockpit Pro" — Free is a generous preview, Pro
removes the count ceilings.

## Architecture summary

Five layers, all under `apps/studio-mobile/src/billing/`:

1. **`useEntitlement.ts`** — thin hook over `useBilling().entitlement`,
   normalizes to `{ tier, isPro, premiumEnabled, isLoading, isUnknown }`.
2. **`entitlementGates.ts`** — single source-of-truth limits registry with
   the matrix above + gate-key types: `'folders.create' | 'labels.create' |
   'tags.create' | 'pinned.create' | 'imports.create' | 'archive.store'`.
3. **`useFeatureGate.ts`** — per-gate hook returning
   `{ allowed, reason, current, limit, upgradeMessage }`. **Short-circuits
   to `allowed: true` when `MOBILE_BILLING_VERIFIED === false`** — this is
   the master switch that keeps the entire system dormant until 5.0I
   activates.
4. **`<UsageChip current={3} limit={5} />`** — compact "3/5" display for
   section headers. Shows skeleton while `isLoading`. Hidden when Pro.
5. **`<UpgradePrompt feature="folders" />`** — inline pill that appears
   only when a gate denies an action. Tap → routes to `/account-billing`.

## Activation gate (master switch)

```ts
// apps/studio-mobile/src/billing/useFeatureGate.ts
import { MOBILE_BILLING_VERIFIED } from './billingConfig';
import { useEntitlement } from './useEntitlement';

export function useFeatureGate(key: GateKey, current: number): GateResult {
  const entitlement = useEntitlement();

  // Master switch: while billing is dormant, ALL gates pass.
  if (!MOBILE_BILLING_VERIFIED) {
    return { allowed: true, reason: 'allowed', current, limit: Infinity, ... };
  }

  // Pro users: always allowed.
  if (entitlement.isPro) {
    return { allowed: true, reason: 'allowed', current, limit: Infinity, ... };
  }

  // Free users (and unknown for creation gates): apply limits.
  const limit = LIMITS[key];
  return {
    allowed: current < limit,
    reason: current >= limit ? 'limit_reached' : 'allowed',
    current, limit, ...
  };
}
```

5.0J-E activation = setting some new flag? **No.** 5.0J-E is *not a flag
flip*. It's the moment the gates start actually firing — which happens
automatically the moment `MOBILE_BILLING_VERIFIED` flips to `true` in
5.0I-E. So 5.0J-E becomes a "verify activation looks right" QA pass and a
closeout doc, not a code change.

This means the *code commits* for 5.0J are entirely 5.0J-A (scaffolding) +
5.0J-D (cleanup) + 5.0J-E (closeout doc). No flag-flip commit needed.

## UI / UX rules (v1)

1. **Never block onboarding.** Free users complete onboarding without
   seeing a single Pro pitch.
2. **Inline, never modal.** Upgrade prompts appear next to the limited
   action, not as fullscreen interruption.
3. **One prompt per session per gate.** Debounce to once per app launch.
4. **Friendly copy.** "Upgrade to Pro for unlimited folders" beats "Pro
   feature required."
5. **Visible usage, not hidden countdowns.** Free users see "3/5" in the
   relevant header.
6. **Empty-state pitch only after first item.** First-time
   Folders / Tags / Labels screens show no Pro pitch until the user has
   created their first item.
7. **No notification badges or red dots** on the Settings →
   Subscription/Billing row in Free state.
8. **`/account-billing` is the only marketing surface.** Everything else
   stays utilitarian.
9. **Existing items always remain accessible.** A user who was Pro and
   downgrades keeps their 6th–50th folder; only *creation* of folder #51 is
   gated. UsageChip handles `current > limit` gracefully.

## Offline / unknown entitlement behavior

`useEntitlement()` reports `isUnknown: true` when the BillingContext has not
yet completed an entitlement fetch (or the fetch failed). Behavior:

- **Unknown → treat as Free for *creation* gates.** Better to err toward
  limits than to silently allow over-creation that becomes stuck data after
  refetch.
- **Unknown → treat as Pro for *visibility* gates.** Don't surface "Pro
  feature locked" splashes just because the device is offline. (Visibility
  gating is deferred to a later phase — but the rule is documented now.)
- **Existing items always remain accessible** regardless of entitlement
  state. Editing, opening, deleting always work. Only *creation* is gated.
- **Loading skeleton ≠ unknown.** During the boot fetch, render skeleton
  chips (no number) rather than flashing "0/5".
- **Sign-out clears all gate state immediately.** No leak from one user's
  tier into another's session.

## Implementation phases

| Phase | Subject | Files | Behavior |
|---|---|---|---|
| **5.0J-A** | `feat(mobile): add dormant entitlement gating scaffolding` | New: `useEntitlement.ts`, `entitlementGates.ts`, `useFeatureGate.ts`, `<UsageChip>`, `<UpgradePrompt>`. Modified: folders, tags, library, pinned, import-chatgpt-link, archived, settings. Validator. | All gates honor `MOBILE_BILLING_VERIFIED` master switch — while false, all pass through allowed=true. UsageChips render but show no limit pressure. |
| **5.0J-B** (external) | exact final copy + limit numbers review | none (or a copy-only doc edit) | UX/marketing pass on upgrade-prompt strings. Limit numbers may adjust based on Free-tier feedback. |
| **5.0J-C** (local) | local QA flag flip | local `mobileConfig.ts` flip, **never committed** | Flip `MOBILE_BILLING_VERIFIED = true` locally with a Free test account, walk every gate, confirm no false positives, no annoyance patterns, no broken downgraded-user data. |
| **5.0J-D** | `chore(mobile): finalize entitlement gating polish` | UI tweaks from QA + closeout doc | Flag stays false in repo. |
| **5.0J-E** | closeout — *not a flag flip* | closeout doc updates after 5.0I-E activates | Gates engage automatically when `MOBILE_BILLING_VERIFIED` flips in 5.0I-E. 5.0J-E records the activation observation and closes the milestone. |

## Files likely to touch (later — informational, no edits now)

### New (5.0J-A scope)
- `apps/studio-mobile/src/billing/useEntitlement.ts`
- `apps/studio-mobile/src/billing/entitlementGates.ts`
- `apps/studio-mobile/src/billing/useFeatureGate.ts`
- `apps/studio-mobile/src/components/billing/UsageChip.tsx`
- `apps/studio-mobile/src/components/billing/UpgradePrompt.tsx`
- `tools/validation/identity/validate-mobile-entitlement-gating.mjs`
- `docs/identity/IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_CLOSEOUT.md` (at 5.0J-D / 5.0J-E)

### Modified (5.0J-A scope)
- `apps/studio-mobile/src/app/folders/index.tsx` — gate on `folders.create`
- `apps/studio-mobile/src/app/tags.tsx` — gate on `tags.create`
- `apps/studio-mobile/src/app/library.tsx` — gate on `labels.create`
- `apps/studio-mobile/src/app/pinned.tsx` — gate on `pinned.create`
- `apps/studio-mobile/src/app/import-chatgpt-link.tsx` — gate on `imports.create`
- `apps/studio-mobile/src/app/archived.tsx` — gate on `archive.store`
- `apps/studio-mobile/src/app/settings.tsx` — Plan & limits preview row
- `tools/validation/identity/run-identity-release-gate.mjs` — wire validator

### Deferred to extension milestone (Control Hub re-opening)
- 0F3a Folders, 0F5a Tags, 0F6a Labels — creation guards
- 0F1d Library Insights — visibility gate
- 0X1a Command Bar — visibility gate
- 1A3a Highlight Dots — custom palette gate
- Smart Highlights / Bookmarks Tab / panels — visibility gates

## Validator plan (informational, not yet wired)

`validate-mobile-entitlement-gating.mjs` will assert:

1. `useEntitlement` reads from `useBilling()`, never from
   `MobileSupabaseProvider` directly.
2. `entitlementGates.ts` exports a single source-of-truth limits table
   matching the matrix above.
3. Each gate-key exists in exactly one registry entry — no duplicates.
4. `useFeatureGate` short-circuits to `allowed: true` when
   `MOBILE_BILLING_VERIFIED === false` (master-switch test).
5. Every screen that calls `useFeatureGate` imports
   `MOBILE_BILLING_VERIFIED` (defense-in-depth wiring check).
6. No screen imports `entitlementGates.ts` directly — all gate consumption
   is through the hook.
7. `UpgradePrompt` always navigates to `/account-billing` on tap.
8. No `console.*` of entitlement state in mobile bundle.
9. `identity-debug.tsx` and `settings.tsx` (apart from the new "Plan &
   limits" preview row) contain no gate references — preserves the 5.0B
   identity-debug wall.
10. No backend RPC names hardcoded in gate logic — gates are pure
    client-side in v1.

## Risks / blockers (carried forward)

1. **Sequencing risk.** Activating gates before billing UI is live = walls
   without exits. Mitigation: master switch reuses `MOBILE_BILLING_VERIFIED`;
   activations are inherently bundled.
2. **Limit numbers will need adjustment.** v1's 5/20/15/10/10/100 are
   educated guesses. Real users will tell us they're wrong. Limits are
   centralized in one file; adjustments are one-line PRs.
3. **Existing data of downgraded users.** Pro user with 50 folders downgrades
   → UsageChip shows `50/5`. UI must handle "current > limit" gracefully (no
   negative remaining count). Test explicitly during 5.0J-C QA.
4. **Free users abusing client-side bypass.** Determined user with dev
   tools could flip `tier === 'pro'` locally. Their data still respects
   RLS, so it's only their own database — fairness loss, not security
   loss. Acceptable for v1; backend enforcement closes this in v1.5.
5. **Cross-device count drift.** Folders created on mobile vs extension
   should count toward the same global total. Already true if the state
   stores sync via Supabase, but verify during 5.0J-C QA.
6. **Demo / screen-share annoyance.** "Upgrade to Pro" pills splashed
   during a product demo to a friend is awkward. Already mitigated by
   once-per-session debouncing; flag during QA if it surfaces.
7. **Extension gating is half the value, deferred.** Users on both mobile
   + extension see gates only on mobile in v1. Acceptable for early testing;
   extension milestone closes the gap when Control Hub re-opens.
8. **Apple Developer access.** Real-iPhone QA for the activated state
   requires the same Apple Developer access that's been carried-over since
   5.0G. Dormant scaffolding (5.0J-A) can land without it.
9. **Marketing / pricing copy not finalized.** Upgrade-prompt strings are
   placeholder. Final copy needs marketing sign-off before 5.0J-D
   closeout.

## Deferred / out of scope

- Extension/browser gating (Control Hub off-limits)
- Backend `check_entitlement_limit` RPC enforcement (v1.5+)
- Feature-visibility gates (hide Smart Highlights / Library Insights /
  Command Bar from Free) — quantity-only for v1
- Trial logic ("Free for 14 days then auto-downgrade") — Stripe/portal can
  handle this if/when needed; no special mobile logic required
- Promo codes, regional pricing, multi-currency limits — Stripe-side
  concerns
- Per-organization limits — single-user product; not needed
- Localization of upgrade copy — English-only in v1

## Status of dependencies

| Dependency | State |
|---|---|
| Phase 5.0I-A dormant billing implementation | done (in working tree, dormant) |
| Phase 5.0I-B backend verification | done (passed) |
| Phase 5.0I-C live iPhone QA | blocked by Apple Developer access |
| Phase 5.0I-E billing UI activation | blocked on 5.0I-C |
| Phase 5.0J-A scaffolding | future — wait |
| Phase 5.0J-E gate activation | inherits 5.0I-E master switch |

This document will be revisited and refined when 5.0I-E lands. The locked-in
decisions above are the design contract; anything else may evolve.
