# Phase 5.0I Mobile Billing Closeout

> **Status: DRAFT — pending live iOS QA.**
> The Phase 5.0I-A dormant implementation is in the working tree (validators
> green, `MOBILE_BILLING_VERIFIED = false`). Phase 5.0I-B backend verification
> passed end-to-end against Supabase + Stripe sandbox. Real-iPhone QA on a
> signed dev build (5.0I-C) has **not** been performed yet — every row in the
> runtime QA matrix is marked `PENDING`. This document is the gate input for
> the activation commit; activation itself remains future work and is blocked
> by missing Apple Developer access (carryover from Phase 5.0G).

## Summary

Phase 5.0I added a complete mobile billing surface as dormant code:

- **Read path**: entitlement state via the existing
  `public.get_current_entitlement()` RPC (SECURITY DEFINER, granted to
  `authenticated`). Mobile cannot SELECT the underlying `billing_*` tables
  directly — RLS blocks it; the RPC is the single safe read path.
- **Action paths**: Stripe-hosted Checkout and Customer Portal opened via
  `WebBrowser.openBrowserAsync` (in-app `SFSafariViewController` on iOS).
  Backend Edge Functions sign all Stripe requests; the Stripe secret key
  never reaches mobile.
- **Refresh triggers**: boot when authenticated, AppState `'active'`
  transition, post-action forced refresh; all throttled to once per 30s
  (mirrors the browser Billing Core's `REFRESH_THROTTLE_MS`).
- **UI**: a new `/account-billing` screen, accessed from a flag-gated
  Subscription/Billing row in Settings. Free users see Upgrade Monthly /
  Upgrade Yearly buttons; Pro users see Manage Subscription. All actions
  are gated behind `MOBILE_BILLING_VERIFIED && Platform.OS === 'ios'`.

The dormant landing means the implementation, validator, error copy, and
runtime triggers are all in source — only the surface (Settings row +
account-billing actions) is gated. Activation is a one-line flag flip in
`mobileConfig.ts`.

## Backend verification (Phase 5.0I-B summary)

All 12 verification steps passed against the dev Supabase project
`kjwrrkqqtxyxtuigianr` and the connected Stripe sandbox.

| # | Check | Result |
|---|---|---|
| 1 | Supabase project access | ✅ |
| 2 | 3 Edge Functions deployed: `create-checkout-session`, `create-customer-portal-session`, `stripe-webhook` | ✅ |
| 3 | 9 user-managed Edge Function secrets present | ✅ |
| 4 | `get_current_entitlement` RPC exists, SECURITY DEFINER, returns `jsonb` | ✅ |
| 5 | All 5 billing tables with `rls_enabled=true` and `rls_forced=true` | ✅ |
| 6 | Stripe sandbox/test mode confirmed | ✅ |
| 7 | Customer Portal configured with cancellation enabled | ✅ |
| 8 | Webhook endpoint registered, active, pointing to `https://kjwrrkqqtxyxtuigianr.supabase.co/functions/v1/stripe-webhook` | ✅ |
| 9 | 5 events subscribed (`checkout.session.completed`, `customer.subscription.created`/`updated`/`deleted`, `invoice.payment_failed`); 4 confirmed via real delivery records, 1 inferred | ✅ |
| 10 | `STRIPE_WEBHOOK_SECRET` matches between Stripe + Supabase (proven by 200-OK delivery responses including `"entitlementActivated": true`) | ✅ |
| 11 | Both Stripe prices exist on the `Cockpit Pro` product: €9.99/month (default) and €99.00/year, both active | ✅ |
| 12 | Both `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_YEARLY` env vars overwritten with known-good values copied directly from Stripe — verified equal by construction | ✅ |

### Carryover notes from 5.0I-B

- **Historical 33% webhook failure rate is resolved.** 6 errors clustered
  in a 5-minute window during initial deployment (May 1, 8:21–8:26 PM); every
  delivery since has been 200 OK with the function's success payload
  (`{ ok: true, supported: true, processed: true, synced: true,
  entitlementActivated: true }`).
- **Yearly price has 0 active subscriptions** as of verification. Mobile
  QA's "Upgrade Yearly" tap will be the first real-world exercise of the
  `pro_yearly` path.
- **`billing_entitlements` showed 0 rows in dashboard stats** despite 2
  subscriptions. Likely stale `pg_stat_user_tables.n_live_tup`. Worth a
  `SELECT count(*) FROM billing_entitlements;` cross-check during QA but
  not blocking.
- **Customer Portal "switch plans" toggle is OFF** — fine for v1; revisit
  before public launch if monthly↔yearly upgrades inside the portal become
  desired.

## Mobile architecture

Six modules, all under `apps/studio-mobile/src/billing/` plus one new screen.

### `billingConfig.ts`
- `MOBILE_BILLING_VERIFIED = false` — master kill switch. Settings row stays
  disabled; account-billing screen renders entitlement display but Upgrade /
  Manage buttons are hidden.
- `PLAN_KEY_PRO_MONTHLY = 'pro_monthly'`, `PLAN_KEY_PRO_YEARLY = 'pro_yearly'` —
  matches backend Edge Function plan-key allow-list.
- `isValidStripeCheckoutUrl()` — verifies URL starts with
  `https://checkout.stripe.com/`.
- `isValidStripePortalUrl()` — verifies URL starts with
  `https://billing.stripe.com/`.
- `BILLING_REFRESH_THROTTLE_MS = 30 * 1000`.

### `MobileBillingProvider.ts` — backend client
- Reads entitlement via raw `fetch` against
  `<supabase-url>/rest/v1/rpc/get_current_entitlement` (no Supabase SDK
  import — the 5.0B mobile-alignment validator pins SDK ownership to
  `MobileSupabaseProvider.ts` only).
- Calls `<supabase-url>/functions/v1/create-checkout-session` with
  `{ planKey: 'pro_monthly' | 'pro_yearly' }`.
- Calls `<supabase-url>/functions/v1/create-customer-portal-session` with
  `{}`.
- Maps server-side error codes (`subscription_already_active`,
  `checkout_already_pending`, `customer-not-found`, etc.) to namespaced
  `billing/...` codes that drive the UI's friendly-error table.
- Validates returned URLs against the Stripe host allow-list before
  returning; throws `billing/checkout-url-invalid` or
  `billing/portal-url-invalid` on mismatch.
- Receives `getAccessToken: () => string | null` callback at construction
  time — no direct dependency on `MobileSupabaseProvider`.

### `BillingContext.tsx` — React provider
- Owns entitlement state in memory only — never persisted to AsyncStorage,
  SecureStore, or `mobileStorage`.
- Boots on `identity.isReady && identity.isSignedIn`; clears on sign-out.
- AppState `'change'` listener triggers throttled refresh on `'active'`
  transitions.
- `startCheckout(planKey)` opens the Stripe Checkout URL via
  `WebBrowser.openBrowserAsync` and forces an entitlement refresh after
  dismissal. Auto-redirects to Portal on `subscription_already_active` per
  the backend's `action: 'open_portal'` hint.
- `openCustomerPortal()` mirror flow.
- Exposes `useBilling()` hook returning
  `{ entitlement, loading, lastError, refreshEntitlement,
  refreshEntitlementForced, startCheckout, openCustomerPortal }`.

### `account-billing.tsx` — new route
- Plan card with tier-aware status pill (`FREE` / `PRO` / `ACTIVE` /
  `TRIAL` / `ENDING` / `PAYMENT ISSUE` / `UNPAID` / `CANCELED`).
- Subtitle reflects `currentPeriodEnd` formatted as "Renews on Nov 5, 2026"
  / "Access ends on …" / "Trial ends on …" / etc.
- Action buttons gated on `MOBILE_BILLING_VERIFIED`:
  - Free users → Upgrade Monthly + Upgrade Yearly
  - Pro users (broadly defined to include `past_due` / `unpaid` /
    `canceled`) → Manage Subscription
- Refresh button + "Last synced X ago" footer.
- Signed-out empty state with "Go to sign-in" link.
- Inline error banner for any `billing/*` error code.

### Settings row
- The pre-existing `Subscription/Billing` placeholder row in
  `apps/studio-mobile/src/app/settings.tsx` is now flag-gated:
  - `MOBILE_BILLING_VERIFIED && identity.isSignedIn` → enabled, routes to
    `/account-billing`, shows tier-aware trailing pill (`FREE` / `PRO` /
    `ENDING`)
  - Otherwise → disabled with "Soon" trailing label

### `IdentityContext.getAccessToken`
- A `getAccessToken: () => string | null` callback added to
  `IdentityContextValue` (read at call-time, not captured at render).
- Allows `BillingContext` to authenticate against the RPC + Edge
  Functions without re-implementing session management.
- **NOT added to the `IdentityProvider` contract** in
  `packages/identity-core/src/contracts.ts` — keeps the contract surface
  Identity-only. The 5.0I validator enforces this boundary.

## Security boundaries

Source-enforced via the `validate-mobile-billing.mjs` validator (15
sections); will be runtime-verified during QA row 11.

- **No Stripe SDK in mobile.** The validator forbids `from 'stripe'` and
  `from '@stripe/...'` imports anywhere in the mobile bundle. Stripe-hosted
  Checkout/Portal URLs only, opened via `WebBrowser.openBrowserAsync`.
- **No Stripe secret key in mobile.** `STRIPE_SECRET_KEY` lives only in the
  Edge Function environment. Never returned by any function. The validator
  forbids any reference to `STRIPE_SECRET_KEY`, `sk_test_`, `sk_live_`,
  `STRIPE_WEBHOOK_SECRET`, `whsec_` in the mobile source.
- **No Supabase service-role key in mobile.** Same posture — the validator
  forbids `SUPABASE_SERVICE_ROLE_KEY` and `service_role` references.
- **Entitlement is memory-only.** `BillingContext` state never enters
  `mobileStorage` / `secureStore` / AsyncStorage. The validator forbids
  any `writeSnapshot`, `writeRefreshToken`, `writeDeviceToken`,
  `sanitizeForPersistence`, `writeSessionMeta`, `AsyncStorage.setItem`,
  `SecureStore.setItemAsync` calls from the billing module.
- **Stripe URLs allow-listed.** Both `isValidStripeCheckoutUrl`
  (`https://checkout.stripe.com/`) and `isValidStripePortalUrl`
  (`https://billing.stripe.com/`) verify URLs *before* they're handed to
  WebBrowser. Anything else throws `billing/*-url-invalid`.
- **No raw Stripe URLs / customer IDs / subscription IDs logged.** The
  validator forbids `console.*` of `https://checkout.stripe.com/...`,
  `https://billing.stripe.com/...`, `stripe_customer_id`,
  `stripe_subscription_id`, `customer_id`, `subscription_id`.
- **Identity ↔ Billing boundary.** `BillingContext` consumes
  `useIdentity().getAccessToken` and never imports
  `MobileSupabaseProvider` directly. The validator enforces both halves.
- **Plan-key allow-list.** Mobile validates `pro_monthly` / `pro_yearly`
  client-side; the Edge Function re-validates server-side.

## Runtime QA matrix

> All rows below are **PENDING** until QA is performed on real iPhone
> hardware with `MOBILE_BILLING_VERIFIED = true` flipped locally
> (never committed). The matrix will be updated to `PASS` (or
> `FAIL` with diagnostic notes) after the QA run. The QA run requires
> Apple Developer access (carryover blocker — see "Blockers" below).

| # | Scenario | Result |
|---|---|---|
| 1 | Cold-launch as Free user → Settings → Subscription/Billing row shows `FREE` trailing pill; tap → /account-billing → Plan card shows "Free" + "Upgrade to unlock all features." subtitle | **PENDING** |
| 2 | Tap "Upgrade Monthly" → SFSafariViewController opens with `https://checkout.stripe.com/...` URL; Stripe-hosted page loads with €9.99/month plan visible | **PENDING** |
| 3 | Tap "Upgrade Yearly" → SFSafariViewController opens with `https://checkout.stripe.com/...` URL; Stripe-hosted page loads with €99.00/year plan visible (FIRST EVER yearly exercise) | **PENDING** |
| 4 | Complete monthly checkout with Stripe test card `4242 4242 4242 4242` → success page in Safari → dismiss → app foregrounds → entitlement auto-refreshes within ~3s → screen shows "Pro · Renews on …" | **PENDING** |
| 5 | Cancel mid-checkout (close Safari without paying) → app foregrounds → entitlement still Free; no error banner | **PENDING** |
| 6 | As Pro user, tap "Manage Subscription" → Customer Portal opens in Safari → cancel subscription → dismiss → app foregrounds → entitlement reflects `cancelAtPeriodEnd=true`, pill changes to `ENDING` | **PENDING** |
| 7 | Webhook entitlement sync: after step 4 above, query `SELECT tier, premium_enabled FROM billing_entitlements WHERE user_id = '<test-user>';` returns `tier='pro', premium_enabled=true`; after step 6, returns `tier='pro', cancel_at_period_end=true` (or `tier='free'` once the period ends) | **PENDING** |
| 8 | AppState foreground refresh: while account-billing screen is open, background the app for 60s, foreground → "Last synced just now" updates; throttle (30s) prevents over-refresh | **PENDING** |
| 9 | Sign out from /account-identity → /account-billing redirects to signed-out empty state with "Go to sign-in" link; sign back in → entitlement re-fetches and shows correct tier | **PENDING** |
| 10 | Force-quit app and relaunch → existing session restores via refresh-token path → /account-billing shows correct entitlement (no flash of "Free" before fetch completes; skeleton chip during loading) | **PENDING** |
| 11 | Offline refresh failure: enable airplane mode, tap Refresh → friendly error banner "Network error. Check your connection."; UI doesn't hang; existing entitlement state preserved | **PENDING** |
| 12 | Race condition / `subscription_already_active`: as a Pro user, tap "Upgrade Monthly" again → backend returns `subscription_already_active` with `action: 'open_portal'` → app auto-redirects to Customer Portal | **PENDING** |
| 13 | Free user with no Stripe customer record taps any path that hits Customer Portal: Manage button hidden by `canManageBilling()` guard; if forced, returns `billing/customer-not-found` with friendly "No subscription on file yet." | **PENDING** |
| 14 | Logs scan during all of the above (Metro / Xcode console): no `cus_…` Stripe customer IDs, no `sub_…` subscription IDs, no `sk_…` Stripe secret keys, no full `https://checkout.stripe.com/...` or `https://billing.stripe.com/...` URLs (which contain session-bound tokens in query strings), no plain access/refresh tokens | **PENDING** |
| 15 | Cross-device entitlement: pay on mobile (step 4) → open browser/extension → entitlement reflects Pro within 30s of foregrounding (uses Billing Core's same throttled refresh path) | **PENDING** |

QA exit criteria: rows 1–15 all `PASS`; the activation commit can land
afterward.

## Blockers

1. **Apple Developer access required.** Real-iPhone signed dev builds need
   the same paid Apple Developer Program membership that's been blocking
   Phase 5.0G Apple Sign-In QA since the original 5.0G plan. iOS Simulator
   can run the app and call the Edge Functions but won't reliably exercise
   the full SFSafariViewController → Stripe → return flow on real hardware.
   Until access lands, 5.0I-C QA cannot start.
2. **`MOBILE_BILLING_VERIFIED` remains `false`.** No flag flip will be
   committed until every row in the QA matrix is `PASS`. Activation is a
   single-line edit to `apps/studio-mobile/src/billing/billingConfig.ts`
   (`false` → `true`); see "Activation note" below.
3. **(Soft) Stripe `success_url` / `cancel_url` are configured server-side
   to chatgpt.com surfaces.** Mobile users in SFSafariViewController will
   see a brief redirect there before dismissing back to the app. UX is
   workable but not branded; address in 5.0I-D polish if QA reveals it's
   intolerable, otherwise defer to 5.0H or beyond.

## Deferred (out of scope for v1)

- **Phase 5.0J Pro entitlement gating** — quantity-based gates on folders,
  labels, tags, pinned chats, imports, archive. Sequenced after 5.0I-E
  activation; gates inherit `MOBILE_BILLING_VERIFIED` so they can't engage
  before users have a working upgrade path. See
  [IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_PLAN.md](IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_PLAN.md).
- **App Store IAP decision.** Apple Guideline 3.1.1 may require In-App
  Purchase for digital subscriptions consumed in-app. The current
  Stripe-Checkout-via-Safari pattern works for internal TestFlight (no
  review) but external/App Store submission may force a pivot. Decision
  needed before external TestFlight; not blocking dormant 5.0I-A code or
  internal QA.
- **External TestFlight / App Store submission.** Lives in Phase 5.0H
  (TestFlight readiness). Adds privacy nutrition labels, Beta App Review
  info, marketing assets, demo account.
- **Custom mobile success/cancel pages.** Branded landing pages on
  cockpitpro.studio that redirect back to the app via universal link
  instead of the current chatgpt.com surfaces. Backend change to add a
  `mobileSuccessUrl` / `mobileCancelUrl` parameter to the Edge Function.
  Future polish.
- **Backend `check_entitlement_limit` RPC.** Server-side enforcement of
  the per-resource limits. Closes the client-side bypass loophole. v1.5+;
  not needed for v1 since RLS already prevents cross-user data access.
- **Plan comparison grid / Subscription Modal mirror.** Mobile v1 uses
  two action buttons (Monthly / Yearly) instead of the browser's
  3-card-grid modal. Plan-comparison grid is v1.5.
- **Apple StoreKit fallback.** If Apple forces IAP, a parallel implementation
  using `expo-in-app-purchases` / native StoreKit. Separate phase entirely.
- **Push notifications for subscription state changes** (renewed, payment
  failed). Mobile currently relies on AppState foreground polling. Push
  is a future polish.
- **Subscription cancellation in-app** (without going through Stripe
  Customer Portal). Defer; portal handles it adequately.
- **Receipt validation / invoice history in-app**. Customer Portal handles
  this; deferred unless mobile-native is requested.

## Activation note

Activation (committing `MOBILE_BILLING_VERIFIED = true` to
`mobileConfig.ts`) is a **separate, future commit** — not performed by
this closeout. The intended activation commit:

- Touches exactly one file:
  - `apps/studio-mobile/src/billing/billingConfig.ts` (one-line flip)
- Subject: `feat(mobile): activate billing (5.0I)`
- Pre-commit gate requirements (all must PASS):
  1. `cd apps/studio-mobile && npx tsc --noEmit`
  2. `node tools/validation/identity/validate-mobile-billing.mjs`
  3. `node tools/validation/identity/validate-identity-phase5_0f-mobile-google-oauth.mjs`
  4. `node tools/validation/identity/validate-identity-phase5_0e-device-sessions.mjs`
  5. `node tools/validation/identity/validate-identity-phase5_0d-recovery.mjs`
  6. `node tools/validation/identity/validate-identity-phase5_0b-mobile-alignment.mjs`
  7. `node tools/validation/identity/run-identity-release-gate.mjs`
- Pre-commit gate requirements (real-iPhone QA):
  - Every row in §"Runtime QA matrix" updated to `PASS`.
  - Visual scan of Metro / Xcode console logs during QA confirms no
    plaintext leaks (row 14).
  - This closeout doc updated to remove the DRAFT banner and stamp the
    QA date.

Until that commit lands, the Subscription/Billing row in Settings stays
disabled with "Soon" subtitle, and /account-billing renders entitlement
display but Upgrade/Manage buttons are hidden. The implementation,
validator, error copy, and runtime triggers are all in source — only the
surface is dormant.

Rollback after activation, if ever needed, is a one-line `billingConfig.ts`
flip back to `false`. The `BillingContext`, `MobileBillingProvider`,
account-billing screen, and validator all remain in source as forward-only
infrastructure. The entitlement RPC + Edge Functions on the backend are
unaffected by the flag — they continue to serve any caller (including the
browser/extension Billing Core).

## Status of dependencies

| Dependency | State |
|---|---|
| Phase 5.0F mobile Google OAuth | active (`GOOGLE_OAUTH_VERIFIED = true`) |
| Phase 5.0G Apple Sign-In | dormant; blocked on Apple Developer access |
| Phase 5.0H TestFlight readiness | partial (Tier 1B/1C/1D landed dormant); blocked on Apple Developer access for bundle/EAS work |
| Phase 5.0I-A dormant billing | done (in working tree) |
| Phase 5.0I-B backend verification | done (passed end-to-end) |
| Phase 5.0I-C live iPhone QA | **blocked** — Apple Developer access |
| Phase 5.0I-D cleanup + closeout finalization | depends on 5.0I-C |
| Phase 5.0I-E activation flag flip | depends on 5.0I-D |
| Phase 5.0J entitlement gating | future; sequenced after 5.0I-E |

This document will be revisited and stamped with QA results when 5.0I-C
runs against real iPhone hardware. The locked-in design above is the
contract; QA may reveal copy / UX / edge-case adjustments to land in
5.0I-D before activation.
