# Mobile Identity / Billing / Release — Deferred Backlog

Single source of truth for every incomplete or deferred mobile identity,
billing, or release-readiness item we have planned but not yet finished.
Updated as items advance, blockers shift, or new items get queued.

Cross-links to per-phase plan / closeout docs. For the broader
"completed phases + active state" snapshot, see
[MOBILE_IDENTITY_BILLING_STATUS_INDEX.md](MOBILE_IDENTITY_BILLING_STATUS_INDEX.md).

---

## 1. Phase 5.0G — Apple Sign-In

**Status:** Dormant code shipped (`77a824b feat(mobile): add dormant Apple Sign In`)
+ uncommitted catch-mapper polish in working tree. Closeout draft at
[IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_CLOSEOUT.md](IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_CLOSEOUT.md)
marked DRAFT pending iPhone QA.

**Blocker:** Missing Apple Developer Program access. Sign in with Apple
capability cannot be enabled on the App ID; `.p8` key cannot be generated;
Supabase Apple provider cannot be configured.

**Next action when Apple access lands:**
1. Apple Developer dashboard: enable Sign in with Apple capability on
   `com.anonymous.studio-mobile` App ID (or `com.cockpitpro.studio` after
   Tier 2 rename), generate `.p8` key, capture Team ID + Key ID.
2. Supabase dev project Authentication → Providers → Apple → enable, paste
   credentials.
3. Local QA flag flip: `APPLE_OAUTH_VERIFIED = true` in `mobileConfig.ts`
   (never committed). Run iPhone QA matrix from the 5.0G plan doc.
4. 5.0G-D closeout doc finalization with QA results.
5. 5.0G-E activation commit (single-line flag flip).

**Code exists:** Yes — provider method, validator, UI button (gated),
catch-mapper fix in working tree.
**QA pending:** Yes — iPhone real-hardware required.
**Activation flag:** `APPLE_OAUTH_VERIFIED = false`.
**Recommended model/tool when resumed:** Claude Sonnet (medium reasoning)
for QA-flag-flip + closeout edit; Codex 5.4 for the activation commit.

---

## 2. Phase 5.0H — TestFlight Readiness

**Status:** Tier 1B / 1C / 1D Apple-independent prep is committed
(eas.json profiles, app.json non-bundle production-readiness fields,
Info.plist export-compliance + deployment-target alignment, drafted
release-config validator). See
[next-milestone-testflight-readiness-lovely-hinton.md](file:///Users/hobayda/.claude/plans/next-milestone-testflight-readiness-lovely-hinton.md)
for the broader plan.

**Blocker:** Missing Apple Developer Program access. The Tier 2 atomic
bundle/App-Group rename to `com.cockpitpro.studio` cannot ship without
a registered App ID. EAS credentials, signed `.ipa` build, and TestFlight
upload all require Apple Developer team membership.

**Next action when Apple access lands:**
1. Apple Developer: register App ID `com.cockpitpro.studio` with Sign in
   with Apple capability + register App Group `group.com.cockpitpro.studio`
   + register share-extension App ID.
2. Stand up production Supabase project (separate from dev `kjwrrkqqtxyxtuigianr`),
   apply migrations, configure Google + Apple OAuth providers, allow-list
   redirect URI, capture URL + anon key.
3. Tier 2A native sweep (atomic single PR):
   `app.json` `ios.bundleIdentifier`, both entitlements files App Group,
   `project.pbxproj` `PRODUCT_BUNDLE_IDENTIFIER` for both targets.
4. Tier 2B: wire `validate-mobile-release-config.mjs` into
   `run-identity-release-gate.mjs`.
5. EAS credentials setup; first `eas build --profile internal`; `eas submit`.
6. Add internal testers in App Store Connect; install + smoke-test the
   TestFlight build.
7. Tier 3 closeout doc.

**Code exists:** Tier 1 yes; Tier 2/3 not yet.
**QA pending:** Yes — TestFlight install on real iPhone.
**Activation flag:** None — TestFlight pipeline is not flag-gated.
**Recommended model/tool when resumed:** Claude Sonnet (high reasoning)
for the bundle-rename diff design; Codex 5.5 for atomic Tier 2A/2B
implementation; Codex 5.4 for commits.

---

## 3. Phase 5.0I — Mobile Billing

**Status:** 5.0I-A dormant implementation in working tree (validators
green); 5.0I-B backend verification passed end-to-end; closeout draft at
[IDENTITY_PHASE_5_0I_MOBILE_BILLING_CLOSEOUT.md](IDENTITY_PHASE_5_0I_MOBILE_BILLING_CLOSEOUT.md)
marked DRAFT pending iPhone QA.

**Blocker:** Live iPhone billing QA (5.0I-C) requires a signed iOS dev
build, which requires Apple Developer access.

**Next action when Apple access lands:**
1. Local QA flag flip: `MOBILE_BILLING_VERIFIED = true` in
   `billingConfig.ts` (never committed).
2. Run the 15-row 5.0I-C QA matrix on real iPhone hardware against the
   sandbox Stripe project (test card `4242 4242 4242 4242`).
3. Cross-check `billing_entitlements` + webhook delivery records during
   QA.
4. 5.0I-D closeout doc finalization with QA results + Metro log scan
   (no plaintext token leaks).
5. 5.0I-E activation commit (single-line flag flip).

**Code exists:** Yes — full surface (BillingContext, MobileBillingProvider,
account-billing screen, Settings row, validator).
**QA pending:** Yes — iPhone real-hardware required.
**Activation flag:** `MOBILE_BILLING_VERIFIED = false`.
**Recommended model/tool when resumed:** Claude Sonnet (medium reasoning)
for QA observation + closeout edit; Codex 5.4 for the activation commit.

---

## 4. Phase 5.0J — Pro Entitlement / Feature Gating

**Status:** Plan locked-in at
[IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_PLAN.md](IDENTITY_PHASE_5_0J_ENTITLEMENT_GATING_PLAN.md)
marked Status: FUTURE / BLOCKED BY BILLING ACTIVATION. **No code yet.**

**Blocker:** Sequencing dependency — gates must not engage before users
have a working upgrade path. Master switch reuses
`MOBILE_BILLING_VERIFIED`, so 5.0J cannot activate before 5.0I-E.

**Locked-in v1 limits:**

| Resource | Free | Pro |
|---|---|---|
| Folders | **5** | unlimited |
| Labels | **20** | unlimited |
| Tags | **15** | unlimited |
| Pinned chats | **10** | unlimited |
| Imported ChatGPT links (lifetime) | **10** | unlimited |
| Archived chats stored | **100** | unlimited |

Quantity-only gating model; no feature-visibility gates in v1; client-side
enforcement only (RLS already gates per-user data access).

**Next action when 5.0I-E activates:**
1. 5.0J-A: scaffolding — `useEntitlement.ts`, `entitlementGates.ts`,
   `useFeatureGate.ts`, `<UsageChip>`, `<UpgradePrompt>`, validator;
   modify 6 mobile screens (folders, tags, library, pinned,
   import-chatgpt-link, archived) + Settings preview row.
2. 5.0J-B (external): final marketing review of upgrade copy.
3. 5.0J-C: local QA flag flip (already enabled because gates inherit
   `MOBILE_BILLING_VERIFIED`); walk every gate.
4. 5.0J-D: cleanup + closeout doc; flag stays inherited.
5. 5.0J-E: closeout note (not a flag flip — gates engage automatically
   when 5.0I-E flips its flag).

**Code exists:** No — plan only.
**QA pending:** Yes — iPhone real-hardware required after 5.0I activates.
**Activation flag:** Inherits `MOBILE_BILLING_VERIFIED` (no separate flag
by design).
**Recommended model/tool when resumed:** Claude Opus (high reasoning) for
limits + UX review; Claude Sonnet (medium) for implementation; Codex 5.4
for commits.

---

## 5. Phase 5.0K — Mobile Route-Guard Hardening

**Status:** 5.0K-A implementation in working tree (15 protected screens,
hook, validator). Closeout draft at
[IDENTITY_PHASE_5_0K_ROUTE_GUARDS_CLOSEOUT.md](IDENTITY_PHASE_5_0K_ROUTE_GUARDS_CLOSEOUT.md)
marked DRAFT pending real-device deep-link QA.

**Blocker:** Real-iPhone deep-link QA requires signed dev build (Apple
Developer access). iOS Simulator can exercise some deep-link paths via
`xcrun simctl openurl` but full confidence (cold launch, force-quit
recovery, real network blips) needs hardware.

**Next action when Apple access lands:**
1. 5.0K-C: real-device QA — run the 30-row deep-link matrix from the
   closeout draft.
2. Special attention to row 29 (transient identity-state deep links —
   `password_update_required`, `recovery_code_pending`). If onboarding
   doesn't handle these gracefully, the hook needs a special-case branch.
3. 5.0K-D: closeout doc finalization with QA results.
4. No activation flag — guards are always on once code lands; QA just
   verifies no regressions.

**Code exists:** Yes — hook, 15 modified screens, validator wired.
**QA pending:** Yes — iPhone real-hardware preferred; Simulator partial.
**Activation flag:** None.
**Recommended model/tool when resumed:** Claude Sonnet (medium reasoning)
for QA observation + closeout edit; Codex 5.4 for commits if needed.

---

## 6. Phase 5.0L — Sign Out All Other Devices

**Status:** Plan + Supabase signOut(scope='others') POC plan produced.
**No code yet.** Plan covered architecture (two-step: Supabase
signOut(scope='others') + SECURITY DEFINER `revoke_other_device_sessions`
RPC), confirmation Alert UX, validator design.

**Blocker:** Pre-implementation POC is unrun — needs verification that
Supabase honors `scope='others'` against the dev project. POC plan is
ready (8-step curl sequence with placeholders, no secret printing).

**Next action:**
1. Run the safe POC curl sequence against a disposable test user — verify
   the calling session stays valid, OTHER refresh tokens die immediately,
   OTHER access tokens remain valid until natural TTL (~1 hour).
2. If POC passes: 5.0L-A — server migration (`revoke_other_device_sessions`
   RPC) + provider method + IdentityContext wiring + UI button +
   confirmation Alert + validator + relaxation of 5.0E "must not exist"
   assertion.
3. 5.0L-B: apply migration to dev Supabase via `supabase db push`.
4. 5.0L-C: local QA — sign in on Chrome (already supported), sign in on
   iPhone, tap button, verify Chrome forced re-auth.
5. 5.0L-D / E: closeout + activation flip.

**Code exists:** No — plan + POC only.
**QA pending:** Yes — partial QA possible on Simulator + Chrome; full
real-iPhone QA needs Apple access.
**Activation flag:** Recommended `REVOKE_OTHER_DEVICES_VERIFIED = false`
for consistency with the dormant pattern.
**Recommended model/tool when resumed:** Claude Sonnet (medium reasoning)
for POC interpretation + 5.0L-A implementation; Codex 5.4 for commits.

---

## 7. Per-Device Revoke (single-row revocation)

**Status:** Future. Deferred from 5.0E. **Not yet planned in detail.**

**Blocker:** More complex than "sign out all others." Requires:
- A SECURITY DEFINER RPC that takes a `device_session_id` (or token hash)
  and revokes ONLY that row.
- Coordination with Supabase auth: revoking ONE session requires admin
  signOut for that specific session_id, which is service-role only →
  Edge Function needed.
- UI: per-row swipe-to-revoke or tap-to-revoke gesture in Active Sessions.
- Confirmation flow: "Sign out [Mac — Chrome]?" with destructive style.

**Next action (when prioritized):**
1. Design doc: how to invalidate a SPECIFIC Supabase session_id
   server-side — likely an Edge Function with service-role.
2. Migration: per-row revoke RPC OR direct UPDATE policy that allows
   owner to set `revoked_at` (already possible per 5.0E RLS; the RPC just
   adds a clean API surface).
3. Mobile UI: swipe action on each row in Active Sessions.
4. Validator + closeout.

**Code exists:** No.
**QA pending:** Yes (eventually).
**Activation flag:** Not designed yet.
**Recommended model/tool when resumed:** Claude Opus (high reasoning) for
the Edge Function + admin-signOut design; Claude Sonnet for
implementation; Codex 5.4 for commits.

---

## 8. Account Linking UI

**Status:** Future. Listed as deferred in multiple closeout docs (5.0F
Google OAuth, 5.0G Apple Sign-In). **Not yet planned in detail.**

**Blocker:** More useful after Apple Sign-In is live (5.0G activation),
since linking only matters when there are two identity providers to link.
With only Google active, "linking" is implicit (Supabase auto-merges
on email match).

**Why it's needed:**
- Hide-my-email Apple users get an `@privaterelay.appleid.com` Supabase
  user — DIFFERENT from their email-password account. Supabase doesn't
  auto-merge these. Users may want to link them explicitly.
- Multiple sign-in surfaces (mobile + extension) for the same human user
  may end up as separate Supabase users if they used different OAuth
  providers. Linking would consolidate.

**Next action (when prioritized):**
1. Design doc: linking semantics. Probably "link Apple to my
   password account" requires the user to be signed in via password
   first, then trigger a confirm-Apple-id flow.
2. Server side: an Edge Function that admins-merges two
   `auth.users.id` records into one (preserves all data on the canonical
   record, redirects the FK references on the merged record).
3. Mobile UI: "Connected accounts" section on `/account-identity`.
4. Validator + closeout.

**Code exists:** No.
**QA pending:** Yes (eventually).
**Activation flag:** Not designed yet.
**Recommended model/tool when resumed:** Claude Opus (high reasoning) for
merge-semantics + data-integrity design; Claude Sonnet for
implementation; Codex 5.4 for commits.

---

## 9. Phase 5.0M (or whatever phase number) — Avatar Upload / Profile Image

**Status:** Now being planned. See the inline plan in the conversation
that sourced this backlog entry (Task B). When the plan stabilizes, the
durable doc will live at `IDENTITY_PHASE_5_0M_AVATAR_UPLOAD_PLAN.md`.

**Blocker:** None — Apple Developer access NOT required. Pure
mobile + Supabase Storage work.

**Next action:**
1. Approve the design (greenfield — no existing avatar-image code).
2. Migration: add `avatar_path TEXT` column to `profiles`; new RPC
   `update_identity_avatar_path(p_avatar_path text)`; create Supabase
   Storage bucket `avatars` with INSERT/UPDATE/DELETE policies scoped to
   `auth.uid()::text = (storage.foldername(name))[1]`.
2. Native deps: `expo-image-picker` + `expo-image-manipulator` via
   `npx expo install`. Permission strings in `app.json` and Info.plist.
3. Provider methods: `pickAndUploadAvatar()`, `removeAvatar()`,
   `getAvatarUrl(profile)`.
4. UI: profile-edit avatar block — tap avatar to pick, "Remove photo"
   button, color swatches as fallback.
5. Validator + closeout doc.

**Code exists:** No — plan only.
**QA pending:** Yes — iPhone hardware preferred (real photo library
permission flow, real network upload). Simulator can validate the picker
UX but not the camera roll permission prompt.
**Activation flag:** Recommended `AVATAR_UPLOAD_VERIFIED = false`
initially.
**Recommended model/tool when resumed:** Claude Sonnet (medium reasoning)
for v1 implementation; Codex 5.4 for commits.

---

## Cross-cutting blockers

| Blocker | Affects | Resolution path |
|---|---|---|
| Apple Developer Program access | 5.0G, 5.0H Tier 2/3, 5.0I-C, 5.0K-C | Enroll ($99/year) OR get team-member invite to existing paid team `JDD9465VDA` |
| Off-limits parallel work in identity-surface / Control-Hub / userscripts | Full release gate | Resolution lives outside this conversation's scope; mobile validators all pass independently |
| Supabase signOut(scope='others') unverified against project | 5.0L | 8-step curl POC plan ready; needs ~5 min run |

## Recommended sequencing

### If Apple Developer access lands:
1. **5.0G** activation (Apple Sign-In) — small, validates the path.
2. **5.0H Tier 2/3** — bundle rename + first TestFlight push.
3. **5.0I-C → 5.0I-E** — billing QA on the TestFlight build, activation.
4. **5.0K-C → 5.0K-D** — deep-link QA on the same build.
5. **5.0J-A** — gating implementation (engages automatically with
   billing activation).

Combine 5.0I/5.0K QA into a single multi-flow session per build cycle.

### If Apple access remains blocked:
1. **5.0M Avatar upload** — fully Apple-independent, user-facing
   feature (this conversation's Task B).
2. **5.0L Sign out other devices** — POC + implementation; partial QA on
   Simulator + Chrome.
3. **Custom mobile checkout return pages** — Edge Function tweak to
   accept `mobileSuccessUrl` / `mobileCancelUrl`; closes the
   chatgpt.com-flash UX paper-cut from 5.0I-B.
4. **Sign-out-of-all-other-devices follow-on: per-device revoke** —
   harder; needs Edge Function design.
5. **Production Supabase project stand-up** (Apple-independent prep work
   for 5.0H Tier 3).

---

## Document maintenance

Update this backlog when:
- A blocker resolves (move that item closer to the top, update Status).
- An item lands in code (move it to
  [MOBILE_IDENTITY_BILLING_STATUS_INDEX.md](MOBILE_IDENTITY_BILLING_STATUS_INDEX.md)
  Completed Phases section, leave a 2-line stub here pointing there).
- A new deferred item is identified during planning.

This backlog is the working document; the index is the authoritative
"current state" snapshot. Don't duplicate detail between them.
