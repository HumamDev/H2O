# Identity Phase 5.0C — Mobile User-Facing Identity & Password Change

## Summary

Phase 5.0C builds directly on the 5.0B-core baseline. All security constraints
declared in the 5.0B-core closeout remain locked unchanged; this phase adds the
user-facing surface and one active mutation (signed-in password change) on top
of that foundation.

What is new in 5.0C:

- The native iOS project and Share Extension are now tracked, resolving the
  repo-state warning that 5.0B-core flagged for `apps/studio-mobile/ios/`.
- A polished `/account-identity` route replaces the "Identity Debug only"
  posture as the primary user surface for sign-in, sign-up, profile read-out,
  and sign-out. Identity Debug remains untouched as the QA tool.
- Signed-in users can now change their own password, end-to-end, on real
  hardware. Recovery and Google OAuth remain inert and deferred.

Runtime QA passed on a real iPhone running an Xcode dev build.

## Commits in this milestone

```
a8357be  feat(mobile-ios): track native iOS project and share extension
65309fb  feat(mobile): add user-facing identity sign-in page
8b14dec  style(mobile): polish identity sign-in page
3d96c7c  feat(mobile): add signed-in password change
```

## What shipped

### Account / Identity page (`/account-identity`)

- New route file `apps/studio-mobile/src/app/account-identity.tsx`.
- Three render branches gated by identity state:
  1. Boot gate (`!isReady`) — small spinner with "Checking sign-in…" so the
     signed-out form does not flash on cold launch while the refresh-token
     restore is still running.
  2. Signed-in view — account header (avatar + display name + real email +
     "Signed in" pill), Profile card (read-only Display Name / Email /
     Workspace), Sign-in method card (Email + Password active, "Other sign-in
     methods" inert), Security card, Account-recovery notice, Sign Out.
  3. Signed-out view — segmented "Sign in / Create account" tabs, password and
     email-code sub-modes within Sign in, verify-code panel for OTP and
     account-creation confirmation.
- Settings entry: the `Identity & Sign-in` row in `settings.tsx` now navigates
  to `/account-identity`.
- Top-bar title registered via `_layout.tsx`: `Identity & Sign-in`.
- Provider literal, snapshot mode, raw provider error codes, capabilities, and
  refresh / token plumbing are all kept off this surface — they remain
  Identity-Debug-only.

### UI polish

- Account header avatar bumped to 64×64 with optional `snapshot.profile.avatarColor`
  background tint when present; falls back to a scheme-aware neutral.
- Active tab in the segmented control gets a hairline border, an iOS shadow,
  and Android `elevation: 1` so it reads clearly in both light and dark mode.
- Tab container fades to `opacity: 0.5` while a request is in flight.
- Both signed-out branches and the signed-in branch are wrapped in
  `KeyboardAvoidingView` with `behavior="padding"` on iOS and the top-bar
  `contentTopPadding` as `keyboardVerticalOffset`.
- Focus chain: email → password → submit on the sign-in form; current →
  new → confirm → submit on the change-password form.
- All text inputs carry `accessibilityLabel`; `paddingVertical` raised to 14
  for tap-target comfort.
- Inline primary-blue "Active" pill on the current sign-in method (replaces
  a gray check mark).
- Empty state when `snapshot.profile` is null but `isSignedIn` is true:
  Profile card renders a single "Profile setup pending" row instead of three
  em-dash placeholders.
- "Use a different email" cancel link de-emphasized to `textSecondary` so the
  positive verify CTA is the visual anchor.
- Recovery and change-password copy softened to a calm informational tone.

### Signed-in password change

- Inline disclosure inside the Security card. Tapping the row reveals three
  fields (current password, new password, confirm new password), an "Update
  password" primary button, and a neutral "Cancel" link. No new route.
- Client-side validation runs before any provider call:
  - missing current password
  - missing new password
  - new password length below 8
  - new password equal to current password
  - confirmation mismatch
- Provider implementation in `MobileSupabaseProvider.changePassword`:
  - Reads the in-memory access token and the SecureStore refresh token.
  - Spins up an ephemeral Supabase client with `persistSession: false`.
  - Calls `client.auth.setSession({ access_token, refresh_token })` to attach
    a session, then `client.auth.updateUser({ password, current_password })`.
  - The `current_password` field is honored server-side; the SDK type defs
    may omit it, so it is passed via a narrow `Parameters<...>[0]` cast with
    a one-line code comment.
  - **No `signInWithPassword` pre-call.** The server validates the current
    password atomically inside the `updateUser` request.
  - **No `resetPasswordForEmail` and no `type: 'recovery'` anywhere in the
    flow.**
- New `failSoft` private helper preserves the signed-in snapshot status when
  changePassword errors. The existing `fail()` helper would have flipped the
  user to `auth_error` — i.e. logged them out — which is wrong for a
  password-change failure.
- New module-private `mapPasswordUpdateErrorCode` helper mirrors the browser
  provider's mapping, surfacing friendly codes:
  `identity/password-current-invalid`, `identity/password-weak`,
  `identity/password-update-requires-recent-code`,
  `identity/password-update-session-missing`,
  `identity/provider-rate-limited`, `identity/provider-network-failed`,
  `identity/provider-rejected`, `identity/password-update-failed`.
- Conservative token rotation: the success path only calls `storeSession` if
  `updateUser` returned a fresh `data.session.access_token`. If no new session
  is returned, current tokens are preserved as-is.
- Inline success banner ("Password updated") shown for ~4 seconds after the
  form collapses on success.

## Runtime QA matrix (real iPhone / Xcode dev build)

| Scenario                                          | Result |
| ------------------------------------------------- | ------ |
| Account page reachable from Settings              | PASS   |
| Sign in via password through `/account-identity`  | PASS   |
| Sign in via email-code through `/account-identity`| PASS   |
| Create account through `/account-identity`        | PASS   |
| Boot-gate spinner on cold launch                  | PASS   |
| Signed-in header + Profile + Sign-in method shown | PASS   |
| Change password — wrong current rejected          | PASS   |
| Change password — short new rejected client-side  | PASS   |
| Change password — confirmation mismatch rejected  | PASS   |
| Change password — same-as-current rejected        | PASS   |
| Change password — success path                    | PASS   |
| Sign out from `/account-identity`                 | PASS   |
| Recovery placeholder still inert                  | PASS   |
| Other-sign-in-methods still inert                 | PASS   |
| iOS Share Extension builds with tracked project   | PASS   |

After a successful password change, the user remains signed in. Subsequent
sign-out / sign-in confirmed that the new password works and the old password
is rejected.

## Static validation

| Gate                                  | Result |
| ------------------------------------- | ------ |
| `apps/studio-mobile` `tsc --noEmit`   | PASS   |
| Identity release gate                 | PASS   |

Reproduce:

```
cd apps/studio-mobile && npx tsc --noEmit
node tools/validation/identity/run-identity-release-gate.mjs
```

## Security constraints (still locked from 5.0B-core)

All 5.0B-core constraints carry forward unchanged. Restated for clarity, with
5.0C-specific notes appended where the new code paths could otherwise weaken
them:

- `RECOVERY_FLOW_VERIFIED = false` (unchanged).
- No active recovery flow is implemented. `requestRecoveryCode`,
  `verifyRecoveryCode`, and `setPasswordAfterRecovery` remain stubs that
  return `identity/recovery-flow-not-verified`. The `/account-identity` page
  never calls them.
- No `type: 'recovery'` is introduced anywhere in the sign-in / OTP / link /
  change-password flow.
- `resetPasswordForEmail` is not used.
- Access token remains memory-only.
- Refresh token remains in SecureStore only.
- No raw provider error, raw session, raw user object, or raw token is
  surfaced to the UI, to logs, to Identity Debug, or to `snapshot.lastError`.
- **5.0C-specific (change-password):**
  - Neither `currentPassword` nor `newPassword` enters the snapshot, the
    persisted store, or any error-detail field. `failSoft` deliberately omits
    the third argument to `createIdentityError` for password operations,
    preventing the raw provider error (which can echo request payloads) from
    landing in `snapshot.lastError.detail`.
  - React form state holding the passwords is cleared on success, on cancel,
    and on sign-out.
  - The ephemeral Supabase client used for the update is created with
    `persistSession: false`; the session attached via `setSession` lives only
    in that short-lived client instance and is garbage-collected after the
    call.
  - Provider error mapping translates raw Supabase messages into a fixed set
    of stable identity codes; the underlying message text is never shown to
    the user.

These constraints remain enforced in code and by the 5.0B mobile alignment
validator, which still runs as part of the identity release gate. Any future
change that weakens them must update the spec, the validator, and obtain
explicit phase approval.

## Changed / new files in this phase

### New

- `apps/studio-mobile/src/app/account-identity.tsx` — the polished user-facing
  Identity & Sign-in page (boot gate, signed-in profile/security, signed-out
  tab form, verify-code panel, inline change-password form).
- `apps/studio-mobile/ios/**` — curated native iOS project and Share Extension
  (`H2OStudio.xcodeproj`, shared scheme, `Podfile`/`Podfile.lock`,
  `H2OStudio/{AppDelegate.swift,Info.plist,…}`,
  `H2OShareExtension/{ShareViewController.swift,Info.plist,…}`).
  Generated artifacts (`Pods/`, `build/`, `xcuserdata/`, `.xcode.env.local`)
  remain ignored.

### Modified

- `apps/studio-mobile/src/app/settings.tsx` — single row update so the
  `Identity & Sign-in` entry navigates to `/account-identity`. Subtitle
  changed to "Sign in to sync your account." when signed out.
- `apps/studio-mobile/src/app/_layout.tsx` — Stack screen registration plus
  top-bar title entry for `/account-identity`.
- `apps/studio-mobile/src/identity/MobileSupabaseProvider.ts` — replaced the
  inert `changePassword` stub with the real `setSession` + `updateUser` flow;
  added `failSoft` private method; added module-private
  `mapPasswordUpdateErrorCode`.
- `apps/studio-mobile/.gitignore` — removed the umbrella `/ios` ignore so the
  curated native tree can be tracked. `/android` remains ignored.
- `apps/studio-mobile/ios/.gitignore` — added a hardening block (mobile
  provisioning profiles, signing keys, GoogleService-Info.plist, etc.) and
  disabled the stale React Native template line `project.xcworkspace` so the
  inner `H2OStudio.xcodeproj/project.xcworkspace/{contents.xcworkspacedata,
  xcshareddata/IDEWorkspaceChecks.plist}` files can be tracked.

## Untouched in this phase (per scope)

- `apps/studio-mobile/src/identity/IdentityContext.tsx` — already exposed
  every action method needed by the new UI; no signature changes.
- `apps/studio-mobile/src/app/identity-debug.tsx` — preserved as the QA tool
  with all technical fields (boot status, mode, provider literal, raw error
  codes, raw refresh button) intact.
- `packages/identity-core/*` — contracts and mock provider unchanged.
  `ChangePasswordInput { currentPassword, newPassword }` was already correct.
- `apps/studio-mobile/src/identity/{secureStore.ts,mobileStorage.ts,mobileConfig.ts,selfCheck.ts}`
  — unchanged.
- All recovery code paths.
- All OAuth code paths.
- All billing surfaces.
- Validators (no spec change required).

## Deferred roadmap (forward to next phase)

The following items remain explicitly out of scope and must be addressed in a
later, separately-scoped phase:

- Active recovery flow (gated on promotion of `RECOVERY_FLOW_VERIFIED` to
  `true` plus its own spec, validator, and inbox-verified runtime QA).
- Google OAuth on mobile.
- Mobile billing surface.
- Profile-edit affordance (display-name editing, avatar-color picker) — the
  Profile card is currently read-only.
- TestFlight / production signing & provisioning.
- Expo package maintenance and patch updates (rebuild required; hold for a
  maintenance window).
- Anon / publishable key rotation prior to any production cutover.

## Next phase: recovery planning

Recovery is the largest remaining identity gap and the one with the highest
blast radius if implemented incorrectly. The `/account-identity` page
currently shows two calm placeholders ("Account recovery is on its way"
when signed out, "Account recovery — coming soon" when signed in). When
recovery ships, those placeholders must be replaced with a real flow.

A follow-up phase should produce a recovery spec covering at minimum:

- An email-OTP-based reset that does **not** reuse `signInWithEmail` or
  `type: 'email'`. The recovery and sign-in OTP code paths must remain
  type-segregated so a user holding a recovery code cannot use it to perform
  a normal sign-in (or vice-versa).
- An inbox-verified test plan with an explicit gate that promotes
  `RECOVERY_FLOW_VERIFIED` to `true` only after the live mailbox path is
  exercised end-to-end.
- A rate-limit and lockout strategy. Recovery is the most-attacked endpoint
  in any auth stack; it must not be a free-fire zone.
- A UI flow for "I forgot my password" surfaced from `/account-identity`,
  replacing the placeholder copy without disturbing the rest of the page.
- A new validator entry that fails the release gate if any recovery code
  path is reachable while `RECOVERY_FLOW_VERIFIED = false`.

The 5.0C closeout intentionally does not pre-commit the recovery design —
that is the job of the next spec.
