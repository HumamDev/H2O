# Mobile Identity & Billing — Status Index

A single-page snapshot of where every mobile identity / billing / route-guard
milestone stands. Updated as phases complete or blockers shift. Cross-links
to the per-phase closeout / plan docs.

---

## Completed phases

### 5.0A — Mobile architecture lock
Locked architectural decisions D1–D11 (token custody, refresh policy,
auth flows, snapshot consistency). Doc-only milestone.
→ [IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md](IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md)

### 5.0B — Core mobile identity
Validated Supabase provider, token lifecycle, snapshot consistency,
SecureStore wrapping, secure-import boundary. Identity-debug wall
established (no OAuth/billing/Apple in `identity-debug.tsx` /
`settings.tsx`).
→ [IDENTITY_PHASE_5_0B_CORE_CLOSEOUT.md](IDENTITY_PHASE_5_0B_CORE_CLOSEOUT.md)

### 5.0C — User-facing identity surface
`/account-identity` route, signed-in password change, Settings integration.
Recovery and OAuth dormant in this phase.
→ [IDENTITY_PHASE_5_0C_MOBILE_USERFACING.md](IDENTITY_PHASE_5_0C_MOBILE_USERFACING.md)

### 5.0D — Account recovery
Mobile email-code OTP recovery flow. Phase 4.5 validator bans
`type:'recovery'` to enforce flow. **Active** (`RECOVERY_FLOW_VERIFIED = true`).
→ [IDENTITY_PHASE_5_0D_RECOVERY_CLOSEOUT.md](IDENTITY_PHASE_5_0D_RECOVERY_CLOSEOUT.md)

### 5.0E — Device sessions
Per-device session registration and tracking. SHA-256 token hash
constraint, idempotent UPSERT via `(user_id, device_token_hash)`.
Active devices list on `/account-identity`.
→ [IDENTITY_PHASE_5_0E_DEVICE_SESSIONS_CLOSEOUT.md](IDENTITY_PHASE_5_0E_DEVICE_SESSIONS_CLOSEOUT.md)

### 5.0F — Mobile Google OAuth
Native PKCE flow via `expo-web-browser` + `WebBrowser.openAuthSessionAsync`.
Real-iPhone QA passed 2026-05-05. **Active**
(`GOOGLE_OAUTH_VERIFIED = true`).
→ [IDENTITY_PHASE_5_0F_MOBILE_GOOGLE_OAUTH_CLOSEOUT.md](IDENTITY_PHASE_5_0F_MOBILE_GOOGLE_OAUTH_CLOSEOUT.md)

### Onboarding v2 / v3
Identity-aware logged-out entry redesign and onboarding feature screens
that follow Phase 5.0F sign-in. Active in production builds.

### 5.0H Tier 1B / 1C / 1D — TestFlight readiness scaffolding (in-repo only)
Apple-independent scaffolding committed:
- **Tier 1B**: `eas.json` with development / internal / production
  profiles; `package.json` EAS scripts.
- **Tier 1C**: `app.json` `ios.buildNumber`, `ios.config.usesNonExemptEncryption`,
  `ios.supportsTablet`; `Info.plist` `ITSAppUsesNonExemptEncryption=false`,
  `LSMinimumSystemVersion=15.1`.
- **Tier 1D**: `validate-mobile-release-config.mjs` validator (drafted but
  intentionally not wired into the release gate until the bundle/App
  Group rename atomic-lands in Tier 2).

### 5.0I-A — Dormant mobile billing
Complete billing surface as dormant code:
- `apps/studio-mobile/src/billing/` — `billingConfig.ts`,
  `MobileBillingProvider.ts`, `BillingContext.tsx`.
- `apps/studio-mobile/src/app/account-billing.tsx` — full screen.
- Settings row flag-gated; `IdentityContext.getAccessToken` boundary.
- `validate-mobile-billing.mjs` validator wired into release gate.
- `MOBILE_BILLING_VERIFIED = false` master switch in source.
- Catch-mapper fix in `signInWithApple` (preserve mapper output for all
  paths) carried forward in working tree.

### 5.0I-B — Backend billing verification
All 12 verification steps passed against dev Supabase
`kjwrrkqqtxyxtuigianr` and connected Stripe sandbox. Edge Functions
deployed; required secrets present; `get_current_entitlement` RPC
correct; billing tables RLS-locked; Customer Portal enabled; webhook
active with signature verified end-to-end; both `STRIPE_PRICE_PRO_*`
env vars verified equal to live Stripe price IDs by construction.
→ [IDENTITY_PHASE_5_0I_MOBILE_BILLING_CLOSEOUT.md](IDENTITY_PHASE_5_0I_MOBILE_BILLING_CLOSEOUT.md)
(draft, pending live iPhone QA)

### 5.0J — Pro entitlement gating plan (FUTURE)
Quantity-only gating model designed and locked-in. Limits: 5 folders /
20 labels / 15 tags / 10 pinned / 10 imports / 100 archive. Master
switch reuses `MOBILE_BILLING_VERIFIED` so gates can't engage before
billing UI activates. **No code yet** — plan doc only.
→ [IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_PLAN.md](IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_PLAN.md)

### 5.0K-A — Mobile route-guard hardening
`useRouteGuard` hook + 15 protected screens + static validator. Closes
the deep-link bypass gap (interior routes now redirect signed-out users
to `/account-identity` and signed-in-not-sync_ready users to
`/onboarding`). Validator passes; closeout draft pending real-device QA.
→ [IDENTITY_PHASE_5_0K_ROUTE_GUARDS_CLOSEOUT.md](IDENTITY_PHASE_5_0K_ROUTE_GUARDS_CLOSEOUT.md)
(draft, pending real-device deep-link QA)

---

## Blocked phases

### 5.0G — Apple Sign-In
**Blocked by:** missing Apple Developer Program access. Sign in with Apple
capability cannot be enabled on the App ID, the `.p8` key cannot be
generated, and Supabase's Apple provider cannot be configured. Native
`expo-apple-authentication` flow is implemented dormantly; flag remains
`APPLE_OAUTH_VERIFIED = false`.
→ [IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_PLAN.md](IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_PLAN.md),
[IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_CLOSEOUT.md](IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_CLOSEOUT.md) (draft)

### 5.0H Tier 2 / Tier 3 — TestFlight bundle rename + EAS submit
**Blocked by:** missing Apple Developer Program access. Tier 2A bundle
ID + App Group rename to `com.cockpitpro.studio` cannot ship without a
registered App ID. EAS credentials, signed `.ipa` build, and TestFlight
upload all require Apple Developer team membership.

### 5.0I-C — Live mobile billing QA on real iPhone
**Blocked by:** signed iPhone dev build requirement (Apple Developer
access). The full Stripe-Checkout-via-SFSafariViewController →
webhook → entitlement-refresh round-trip can only be exercised on real
hardware. iOS Simulator cannot reliably exercise SFSafariViewController
to a live Stripe page.

### 5.0K-C — Real-device deep-link QA
**Blocked by:** same Apple Developer access. iOS Simulator can exercise
some deep-link paths via `xcrun simctl openurl` but full confidence
needs real hardware (cold launch, force-quit recovery, real network
blips).

---

## Dormant feature flags

| Flag | Value | Activates after |
|---|---|---|
| `RECOVERY_FLOW_VERIFIED` | `true` | already active (5.0D) |
| `GOOGLE_OAUTH_VERIFIED` | `true` | already active (5.0F) |
| `APPLE_OAUTH_VERIFIED` | **`false`** | 5.0G-C real-iPhone QA passes |
| `MOBILE_BILLING_VERIFIED` | **`false`** | 5.0I-C real-iPhone QA passes |

Note: 5.0J entitlement gates are master-switched on `MOBILE_BILLING_VERIFIED`
— activating billing automatically engages gates. No separate gating flag
exists by design (decision locked in the 5.0J plan).

---

## Safe to do next (no Apple Developer access needed)

These work streams can proceed in parallel while Apple access is pending:

1. **More mobile doc work** — refine plan docs, write closeout drafts,
   capture decisions, refactor the docs index.
2. **Adjacent identity hardening** — sign-out-of-all-other-devices UI,
   per-device session revoke UI (5.0E left these deferred). Server side
   (`device_sessions` table + RPCs) already supports it.
3. **Profile / workspace polish** — display-name editing, avatar color
   improvements, workspace-rename validation tightening.
4. **Theme / appearance work** — additional cockpit theme variants,
   light-mode polish.
5. **Library / archive features that don't depend on Pro gating** —
   search index, folder filtering, label management UX.
6. **Onboarding flow tweaks** — copy refinements, error-state polish,
   flow sequencing for the transient password-update path that 5.0K-C
   QA row 29 will probe.
7. **Apple-independent 5.0H prep** that's not yet committed: any pending
   `validate-mobile-release-config.mjs` changes, additional `eas.json`
   refinements, build-number strategy verification (the validator file
   exists but is not yet wired — wiring waits for the bundle rename).
8. **Server-side enhancements** — Supabase migrations, RPC additions,
   Edge Function polish (e.g., custom `success_url` / `cancel_url`
   parameters for branded mobile checkout returns). All Apple-independent.

---

## Must wait (blocked on Apple Developer access)

These cannot meaningfully proceed without paid Apple Developer Program
membership:

1. **5.0G-C** Apple Sign-In real-iPhone QA → flag activation.
2. **5.0H Tier 2** bundle ID rename to `com.cockpitpro.studio` (Apple
   Developer App ID must exist for new bundle before signed builds work).
3. **5.0H Tier 3** EAS credentials setup, `eas build`, `eas submit` to
   TestFlight.
4. **5.0I-C** Live mobile billing QA (Stripe Checkout / Customer Portal
   round-trip on real hardware).
5. **5.0J-A** entitlement gating implementation (technically possible
   without Apple access, but pointless until 5.0I activates — gates
   would be inert by design).
6. **5.0K-C** real-device deep-link QA → closeout finalization.
7. **External TestFlight / App Store submission** — entire Apple-side
   distribution flow.

---

## Exact external blockers

### 1. Apple Developer Program enrollment
- **What's needed:** paid Apple Developer Program membership, ~$99/year.
- **Two paths:** individual enrollment (instant for most), or
  organization enrollment via D-U-N-S Number (1–2 days verification).
- **Possibly already accessible:** the iOS project has
  `DEVELOPMENT_TEAM = JDD9465VDA` configured. If that team is reachable
  by an existing Apple ID (paid, possibly under a different login),
  enrollment may already be done — verify by signing in to
  <https://developer.apple.com/> with the relevant Apple ID.

### 2. Apple Developer setup (after enrollment)
- App ID `com.anonymous.studio-mobile` (placeholder) AND/OR
  `com.cockpitpro.studio` (production) registered.
- **Sign in with Apple** capability enabled on each App ID.
- App Group registered (`group.com.anonymous.studio-mobile` for QA;
  `group.com.cockpitpro.studio` for production after Tier 2 rename).
- Sign in with Apple `.p8` key generated; Team ID + Key ID captured.
- Distribution certificate + provisioning profile (or let EAS manage
  credentials).

### 3. Supabase Apple provider config (after Apple Developer setup)
- Authentication → Providers → Apple → enable.
- Paste Team ID, Key ID, `.p8` contents.
- Authorized Client IDs = `com.anonymous.studio-mobile`
  (and/or `com.cockpitpro.studio` after Tier 2).

### 4. App Store Connect (only if going to external TestFlight / App Store)
- App record creation under bundle `com.cockpitpro.studio`.
- Internal testers added (no Beta App Review for ≤100 internal).
- For external TestFlight: privacy nutrition labels, demo account, beta
  description, Beta App Review submission.

---

## Recommended next milestone — if Apple access lands

**Sequence (~1–2 weeks of work):**

1. **5.0G-B external setup** (1 hour, dashboards) — Apple Developer App
   ID + capability + `.p8` key; Supabase Apple provider config.
2. **5.0G-C local QA** (~1–2 hours on iPhone) — flip
   `APPLE_OAUTH_VERIFIED = true` locally, run iPhone QA matrix from the
   5.0G plan doc.
3. **5.0G-D / 5.0G-E** — closeout doc finalization + activation commit.
4. **5.0H Tier 2A** atomic native sweep — bundle rename to
   `com.cockpitpro.studio`, App Group rename, `project.pbxproj`,
   entitlements files. Single commit.
5. **5.0H Tier 2B** — wire `validate-mobile-release-config.mjs` into the
   release gate.
6. **5.0H Tier 3A** — EAS credentials setup, first `eas build --profile internal`.
7. **5.0H Tier 3B** — internal TestFlight push + closeout.
8. **5.0I-C** — live mobile billing QA on the same TestFlight build.
9. **5.0I-D / 5.0I-E** — closeout finalization + activation commit.
10. **5.0K-C** — real-device deep-link QA on the TestFlight build.
11. **5.0K-D / 5.0K-E** — closeout finalization.
12. **5.0J-A** — entitlement gating implementation (gates engage
    automatically because billing is now active).

Total real-iPhone hardware QA passes during this stretch: 3
(Apple Sign-In, billing, deep-link guards). Can be combined into a
single multi-flow QA session per build cycle.

---

## Recommended next milestone — if Apple access remains blocked

**Pick one of these Apple-independent work streams** for the next
~1–2 day chunk:

### Option A: Sign-out-of-all-other-devices UI (Phase 5.0L candidate)
Server side (`device_sessions` table + RPCs) already supports it from
5.0E. Mobile UI work: a "Sign out other devices" button on
`/account-identity` Active Sessions section + a confirmation dialog +
the `revoke_other_sessions` RPC call. ~150–250 LOC + validator.
Apple-independent. Useful for security UX.

### Option B: Per-device session revoke UI (Phase 5.0L candidate)
Same posture. Add a swipe-to-revoke or row tap → confirm dialog → RPC
call on each `device_sessions` row in the active-sessions list. UX
nicety + security feature. Apple-independent.

### Option C: Profile / workspace UX polish
Display-name editing UX refinement, avatar-color picker enhancement,
workspace-rename inline editing, error-state copy review across
identity-related screens. Pure UX work. Apple-independent.

### Option D: Library / archive feature work that doesn't intersect Pro gating
Search index implementation, folder-filter UX, label management
improvements. Apple-independent. May be worth pausing if 5.0J gates
will land soon and reshape the Library surface.

### Option E: Onboarding refinements
Copy polish, error-state handling, transient-state path smoothing for
`password_update_required` / `recovery_code_pending` users (which would
preempt the 5.0K-C QA row 29 risk). Apple-independent.

### Option F: Server-side / backend enhancements
- Supabase Apple provider config preparation (can configure ahead of
  Apple-side credential generation; plug values in later).
- Edge Function tweak to accept `mobileSuccessUrl` / `mobileCancelUrl`
  parameters for branded checkout returns (eliminates the brief
  chatgpt.com flash users see in SFSafariViewController after paying).
- Supabase production project stand-up (separate from dev; needs
  migration apply + Google OAuth provider + redirect URL allow-list).

**Recommendation if Apple stays blocked:** start with **Option A** or
**Option B** (sign-out-of-all-other-devices / per-device revoke). Tightly
scoped, Apple-independent, server backend already supports it, finishes
the deferred work from 5.0E. After that, consider Option F's Edge
Function `mobileSuccessUrl` change — closes one of the soft UX issues
flagged in the 5.0I-B verification.

---

## Index of related docs

| Phase | Doc |
|---|---|
| 5.0A | [IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md](IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md) |
| 5.0B | [IDENTITY_PHASE_5_0B_CORE_CLOSEOUT.md](IDENTITY_PHASE_5_0B_CORE_CLOSEOUT.md) |
| 5.0C | [IDENTITY_PHASE_5_0C_MOBILE_USERFACING.md](IDENTITY_PHASE_5_0C_MOBILE_USERFACING.md) |
| 5.0D | [IDENTITY_PHASE_5_0D_RECOVERY_SPEC.md](IDENTITY_PHASE_5_0D_RECOVERY_SPEC.md), [IDENTITY_PHASE_5_0D_RECOVERY_CLOSEOUT.md](IDENTITY_PHASE_5_0D_RECOVERY_CLOSEOUT.md) |
| 5.0E | [IDENTITY_PHASE_5_0E_DEVICE_SESSIONS_CLOSEOUT.md](IDENTITY_PHASE_5_0E_DEVICE_SESSIONS_CLOSEOUT.md) |
| 5.0F | [IDENTITY_PHASE_5_0F_MOBILE_GOOGLE_OAUTH_CLOSEOUT.md](IDENTITY_PHASE_5_0F_MOBILE_GOOGLE_OAUTH_CLOSEOUT.md) |
| 5.0G | [IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_PLAN.md](IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_PLAN.md), [IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_CLOSEOUT.md](IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_CLOSEOUT.md) (draft) |
| 5.0I | [IDENTITY_PHASE_5_0I_MOBILE_BILLING_CLOSEOUT.md](IDENTITY_PHASE_5_0I_MOBILE_BILLING_CLOSEOUT.md) (draft) |
| 5.0J | [IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_PLAN.md](IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_PLAN.md) |
| 5.0K | [IDENTITY_PHASE_5_0K_ROUTE_GUARDS_CLOSEOUT.md](IDENTITY_PHASE_5_0K_ROUTE_GUARDS_CLOSEOUT.md) (draft) |

This index is not a closeout. Update it as phases complete or blockers
shift; refer to the per-phase docs for full design contracts.
