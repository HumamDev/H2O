# Identity Phase 5.0D — Mobile Account Recovery Spec

## Status

`RECOVERY_FLOW_VERIFIED = false`. **Recovery is not enabled.**

This document specifies how the mobile account-recovery flow will be built and
gated, but the flow is not yet implemented. The flag stays `false` and recovery
remains unreachable from the UI until every promotion gate in this spec is
satisfied. No work in this spec is permitted to claim recovery is shipped.

## Background

Phase 5.0C closed out with `/account-identity` shipping the user-facing
sign-in / sign-up / sign-out / change-password surface, leaving recovery as
the last open item from the 5.0B-core deferred roadmap. The browser surface
already implements password reset via `resetPasswordForEmail`; mobile
deliberately diverges and will not adopt that mechanism in v1.

This phase specifies "v1 email-code account recovery" — a mobile recovery
flow that piggybacks on the existing email-code sign-in transport plus an
authenticated `updateUser({ password })` call, with strict client-side state
segregation that keeps recovery distinct from a normal sign-in.

## Hard constraints (carried forward, locked)

These constraints are inherited unchanged from 5.0B-core and 5.0C and must
remain in force throughout v1:

- `RECOVERY_FLOW_VERIFIED = false` until the live-inbox QA matrix passes.
- **No `resetPasswordForEmail`** anywhere in mobile code.
- **No `type: 'recovery'`** anywhere in mobile code (sign-in, OTP, link, or
  verify call).
- Access token is memory-only.
- Refresh token is persisted only via SecureStore.
- No raw provider error / session / user / token surfaced to UI, logs, or
  Identity Debug.
- Passwords (current or new) never enter the snapshot, persisted storage, or
  any error-detail field.
- Normal email-code sign-in must continue to work unchanged. Adding the
  recovery surface must not alter the behavior of `signInWithEmail`,
  `verifyEmailCode`, `signUpWithPassword`, `verifySignupCode`, or
  `signInWithPassword`.

## Design choice: v1 "email-code recovery" (Option B)

### Mechanism

Recovery is implemented by reusing the existing email-OTP sign-in transport
plus a server-validated password update on the resulting session:

1. User taps "Forgot password?" on the signed-out `/account-identity` form
   and enters their email.
2. Mobile calls `signInWithOtp({ email, options: { shouldCreateUser: false } })`
   on a Supabase client — the **same API** used by `signInWithEmail`. Supabase
   sends an email-OTP code if the email exists. If it does not, no email is
   sent and the API returns the same shape (Supabase's documented behavior
   when `shouldCreateUser: false`).
3. User enters the code. Mobile calls
   `verifyOtp({ email, token, type: 'email' })` — **the same `type: 'email'`
   as normal sign-in**. There is no `type: 'recovery'`.
4. The verify call returns a session. Mobile holds the access token in memory
   **but does NOT persist** the refresh token to SecureStore yet, and does
   NOT transition the public snapshot state to a signed-in state. Public
   `snapshot.status` stays `recovery_code_pending`.
5. UI restricts the user to a single "set new password" screen.
6. User enters new password. Mobile calls `updateUser({ password })` with no
   `current_password` (the recovery flow's whole purpose is that the old
   password is unknown). On success, mobile then performs the normal
   `storeSession` write (refresh token to SecureStore, session metadata to
   storage), and transitions `snapshot.status` to `profile_ready` or
   `sync_ready` per the standard post-sign-in path.

### Why this and not custom Edge Functions

| Property | v1 (this spec) | v2 (Option A graduation) |
|---|---|---|
| Server infra | None new | Edge functions + `recovery_codes` table + RLS + audit log |
| Code namespace separation | Client-side only (snapshot state machine) | Server-side (separate table) |
| Audit trail per recovery | None beyond Supabase auth logs | Per-event audit row |
| Rate limiting | Supabase's built-in OTP cooldown | Custom edge cap per email/IP |
| Time to ship | Reuses tested code paths | New ops surface, new validator coverage |
| Threat surface | Same as email-OTP sign-in | Smaller (recovery isolated from sign-in) |

v1 ships first because the threat profile of "control of email gives password
reset" is identical to "control of email gives OTP sign-in," which the app
already accepts. If post-launch we need stricter audit, per-recovery rate
limits, or namespace isolation, **this spec defines a forward graduation path
to Option A** without breaking the public contract: only the provider
internals change.

### State machine

```
anonymous_local
   │
   │ requestRecoveryCode(email)  →  signInWithOtp(...)
   ▼
recovery_code_pending  ◄──────────────┐
   │                                  │  (verify failure: stay here)
   │ verifyRecoveryCode({email,code}) │
   │   →  verifyOtp(type:'email')     │
   │   in-memory access token only    │
   │   refresh token NOT yet stored   │
   ▼                                  │
recovery_code_pending                 │
(verified, password not yet set)      │
   │                                  │
   │ setPasswordAfterRecovery(pw)     │
   │   →  updateUser({ password })    │
   │   on success: storeSession(...)  │
   ▼                                  │
profile_ready / sync_ready  ──────────┘
   (normal signed-in state)
```

The "verified, password not yet set" sub-state is **not** a separate public
state — it stays as `recovery_code_pending` because the public state machine
only changes on the password-set transition. The provider tracks the
"verified" sub-condition internally via a private boolean (e.g.
`recoveryVerified: true`) that resets to `false` on every `requestRecoveryCode`
call and on every `signOut`.

### Restart-on-interrupt rule

If the app is killed, backgrounded long enough to be evicted, or otherwise
loses memory between a successful `verifyRecoveryCode` and a successful
`setPasswordAfterRecovery`, the recovery flow **must restart from email**.
The in-memory access token is lost and the refresh token was never persisted,
so on next launch the user is back at `anonymous_local`. This intentionally
sacrifices a small UX convenience to eliminate the "user has a session but
hasn't set a new password" edge case.

## Provider implementation contract

The following methods are the public surface the UI consumes. They replace
the existing stubs in
[`apps/studio-mobile/src/identity/MobileSupabaseProvider.ts:686-718`](apps/studio-mobile/src/identity/MobileSupabaseProvider.ts:686).
Mock-provider stubs in `packages/identity-core/src/mock-provider.ts` may
remain as-is; they are not part of the runtime path.

### `requestRecoveryCode(email)`

- Validates non-empty, RFC-shape email; rejects via `failSoft` with
  `identity/invalid-email` otherwise.
- Calls `client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`
  on a fresh ephemeral client (`persistSession: false`,
  `autoRefreshToken: false`).
- On success: `commitSnapshot` with `status: 'recovery_code_pending'`,
  `pendingEmail: email`, `lastError: null`. **Does not write any token.**
- On error: `failSoft` with mapped code. **Returns the same user-visible
  result regardless of whether the email is registered**, per anti-enumeration
  below.
- **No `type: 'recovery'`. No `resetPasswordForEmail`.**

### `verifyRecoveryCode({ email, code })`

- Pre-condition: `snapshot.status === 'recovery_code_pending'` and
  `snapshot.pendingEmail` matches the input email. Otherwise `failSoft` with
  `identity/recovery-state-invalid`.
- Validates non-empty code.
- Calls `client.auth.verifyOtp({ email, token: code, type: 'email' })` on a
  fresh ephemeral client.
- On success:
  - Stores the access token **in memory only** on the provider instance.
  - **Does NOT call `storeSession`.** Refresh token stays out of SecureStore.
  - **Does NOT call `writeSessionMeta`.** No session metadata written.
  - Sets the private `recoveryVerified: true` flag.
  - Snapshot stays at `status: 'recovery_code_pending'`. `lastError: null`.
    `updatedAt` bumped.
- On error: `failSoft` with mapped code.

### `setPasswordAfterRecovery(newPassword)`

- Pre-conditions: `snapshot.status === 'recovery_code_pending'`,
  `recoveryVerified === true`, in-memory access token present. Otherwise
  `failSoft` with `identity/recovery-state-invalid`.
- Validates new password length ≥ 8 (matches change-password). `failSoft`
  with `identity/password-too-short` otherwise.
- Builds an ephemeral client, calls `setSession({ access_token, refresh_token })`
  using the in-memory access token AND the refresh token returned from the
  verify step (which the provider held in memory alongside the access token —
  *not* persisted yet).
- Calls `client.auth.updateUser({ password: newPassword })`. **No
  `current_password`.**
- On success:
  - Calls `storeSession(...)` **for the first time** in this flow, writing
    refresh token to SecureStore and session metadata to storage.
  - Calls `loadIdentityState` RPC (same path as verifyEmailCode) to populate
    profile/workspace.
  - Transitions snapshot to `profile_ready` or `sync_ready` per RPC result.
  - Clears `recoveryVerified` and any in-memory recovery scratch.
- On error: `failSoft` with mapped code mirroring change-password's
  `mapPasswordUpdateErrorCode`. **The snapshot stays at
  `recovery_code_pending` so the user can retry the password.** Failure does
  NOT log them out and does NOT lose the verified state.

### Failure semantics — `failSoft` reuse

All three methods use the existing `failSoft` private helper introduced in
5.0C. As in change-password, `failSoft` deliberately omits the `detail`
argument when constructing `IdentityErrorShape`, so raw provider errors that
might echo request payloads never land in `snapshot.lastError.detail`.

## Anti-enumeration

The user-facing response to `requestRecoveryCode(email)` **must be identical
whether the email is registered or not.** This is the standard
anti-enumeration guarantee.

Mechanism:

- `shouldCreateUser: false` causes Supabase to silently no-op when the email
  is unknown — no error, no email sent.
- The mobile provider treats both the "code sent" and "no such user" branches
  identically: snapshot moves to `recovery_code_pending`, `pendingEmail` is
  set, `lastError: null`.
- UI copy after request: **"If that email is registered, we've sent a
  recovery code. Check your inbox."** No "user not found" branch. No
  separate spinner state.
- Subsequent `verifyRecoveryCode` for an unregistered email will fail with
  `identity/verify-recovery-failed` (Supabase rejects the OTP), surfaced as
  the same friendly copy as a real wrong-code attempt: "That code didn't
  work. Try requesting a new one."

The `requestRecoveryCode` method must not log, throw, or set any error code
that distinguishes "no such user" from "code sent." The validator (below)
will grep for any branch in the provider that does so.

## Friendly error mapping

To be added to `FRIENDLY_ERRORS` in
[`apps/studio-mobile/src/app/account-identity.tsx`](apps/studio-mobile/src/app/account-identity.tsx):

| Provider code | User copy |
|---|---|
| `identity/recovery-flow-not-verified` | (suppressed; never user-facing once flag flips) |
| `identity/recovery-state-invalid` | "Start the recovery flow again from your email." |
| `identity/request-recovery-failed` | "Couldn't request a code. Try again in a moment." |
| `identity/verify-recovery-failed` | "That code didn't work. Try requesting a new one." |
| `identity/recovery-code-expired` | "Your code expired. Request a new one." |
| `identity/password-too-short` | (existing) "New password must be at least 8 characters." |
| `identity/password-update-session-missing` | (existing) "Your session expired. Start the recovery flow again from your email." |
| `identity/provider-rate-limited` | (existing) "Too many attempts. Wait a moment, then try again." |
| `identity/provider-network-failed` | (existing) "Network error. Check your connection." |

Mapping helper: extend the existing `mapPasswordUpdateErrorCode` (5.0C) with a
sibling `mapRecoveryErrorCode` for request/verify steps. Same defensive shape:
status + lowercased message → stable identity code.

## UI design

All UI changes occur in
[`apps/studio-mobile/src/app/account-identity.tsx`](apps/studio-mobile/src/app/account-identity.tsx).
No other files.

### Signed-out form

Add a "Forgot password?" link below the primary CTA inside the existing
sign-in tab's `formCard`. Visible only on the Sign-in tab and only in
password mode (not visible on Create-account or in code mode, where it would
be redundant).

Tap → sets a local state `recoveryStage: 'request' | 'verify' | 'set_password' | null`,
which renders the recovery panel (replaces the tab form, similar to how
`pendingCodeKind` replaces the form today).

### Recovery panel (three stages, single panel component)

| Stage | Hero copy | Field(s) | Primary action | Secondary action |
|---|---|---|---|---|
| `request` | "Reset your password" / "Enter the email associated with your account." | Email | "Send recovery code" → `requestRecoveryCode(email)` → on success, advance to `verify` | "Cancel" → return to tab form |
| `verify` | "Check your email" / "If that email is registered, we've sent a recovery code. Enter it below." | Code | "Verify code" → `verifyRecoveryCode({email,code})` → on success, advance to `set_password` | "Use a different email" → reset to `request`, clear local state |
| `set_password` | "Set a new password" / "Choose something different from any password you've used before." | New password, Confirm new password | "Update password" → `setPasswordAfterRecovery(newPassword)` (after client-side mismatch + length checks) → on success, dismiss recovery, user is signed in | "Cancel" → call `signOut()` to drop the in-memory session, return to tab form |

The recovery panel reuses the same input/styling patterns introduced in 5.0C
(field labels, password fields with `secureTextEntry`, primary button with
`buttonDisabled` style, neutral cancel link, `KeyboardAvoidingView` wrap).

### Existing copy replacement

The two placeholder strings in the current file:

- Signed-out notice ("Account recovery is on its way…") — replaced when the
  flag flips, but **kept in source** while the flag is `false`. Recovery is
  not reachable while the flag is false; the placeholder remains the user
  experience.
- Signed-in notice ("Account recovery — coming soon…") — replaced when the
  flag flips. Until then, signed-in users see the existing copy because
  signed-in users do not need recovery (they can use change-password).

The "Forgot password?" link is **not rendered** while
`RECOVERY_FLOW_VERIFIED === false`. Gate the link visibility on the flag, not
on environment or build mode.

## Validator plan

### New validator

`tools/validation/identity/validate-identity-phase5_0d-recovery.mjs`

Asserts (each is a hard FAIL on miss):

1. `MobileSupabaseProvider.ts` no longer contains the recovery stubs that
   return `identity/recovery-flow-not-verified`. (Searched by literal: the
   string `'identity/recovery-flow-not-verified'` does not appear in the
   bodies of `requestRecoveryCode`, `verifyRecoveryCode`,
   `setPasswordAfterRecovery`.)
2. `MobileSupabaseProvider.ts` `requestRecoveryCode` calls
   `signInWithOtp(...)` with `shouldCreateUser: false` and does **not** call
   `storeSession`, `writeRefreshToken`, or `writeSessionMeta`.
3. `MobileSupabaseProvider.ts` `verifyRecoveryCode` calls
   `verifyOtp({ ..., type: 'email' })` and does **not** call `storeSession`,
   `writeRefreshToken`, or `writeSessionMeta`.
4. `MobileSupabaseProvider.ts` `setPasswordAfterRecovery` calls
   `updateUser({ password })` and does **not** pass `current_password`.
5. `apps/studio-mobile/**` grep returns 0 hits for the literal regex
   `resetPasswordForEmail`.
6. `apps/studio-mobile/**` grep returns 0 hits for any of:
   `type:\s*['"]recovery['"]`, `type:\s*['"]recovery_code['"]`.
7. `account-identity.tsx` recovery copy strings exist; the "Forgot password?"
   link's `onPress` calls a function that sets `recoveryStage`; the link is
   gated on `RECOVERY_FLOW_VERIFIED`.
8. `account-identity.tsx` does not log, render, or otherwise surface raw
   `password`, `currentPassword`, or `newPassword` outside of `<TextInput>`
   `value` bindings.
9. `MobileSupabaseProvider.ts` `requestRecoveryCode` does not branch its
   public response on a "user not found" condition (anti-enumeration).
10. `RECOVERY_FLOW_VERIFIED === true` requires this validator to PASS **and**
    requires the live-inbox QA ledger entry below to be PASS.

### Integration with the existing release gate

`tools/validation/identity/run-identity-release-gate.mjs` adds the new
validator to its release group and to its syntax-check group, mirroring how
the 5.0B mobile-alignment validator is wired today.

The existing 5.0B validator's assert-16 (which gates `RECOVERY_FLOW_VERIFIED`
on a recovery validator's PASS) is updated to point at this new file. That is
the only change to the 5.0B validator, and it must not weaken any of the
5.0B asserts.

### Recovery is unreachable while flag is `false`

The validator's assert-7 ensures the "Forgot password?" link is only rendered
when `RECOVERY_FLOW_VERIFIED === true`. Until the flag flips, recovery is
unreachable from the UI even though the provider methods exist. This is the
fast-rollback story: if anything goes wrong post-launch, flipping the flag to
`false` removes the surface in a single edit, with no need to rip out the
provider implementations.

## Live-inbox runtime QA matrix

This matrix must be exercised on a real iPhone using a real mailbox against
the real Supabase project. Each row must PASS. The table is recorded
verbatim in the future Phase 5.0D Closeout doc, with date, tester, device,
and Supabase project identifier. Failure of any row blocks promotion.

| Scenario | Expected result |
|---|---|
| Request code with valid registered email | Email arrives within Supabase's documented OTP delivery window |
| Request code with unregistered email | Same UI response; no email arrives; no error code shown |
| Enter correct code in time | Advances to set-new-password stage |
| Enter wrong code | Friendly error; stays on verify stage |
| Enter expired code (≥ documented OTP TTL) | Friendly error; user can request a new code |
| Reuse a code after success | Rejected; UI stays on tab form (user is signed in with new password) |
| Same code on a second device after first use | Rejected on second device |
| Network drop mid-verify | Friendly network error; no orphaned partial state on snapshot |
| Network drop mid-set-password | Friendly error; snapshot stays at `recovery_code_pending` so retry works |
| Cancel mid-flow on each stage | Returns cleanly to tab form; no leaked state; in-memory session cleared |
| Force-quit between verify and set-password | Reopen lands on tab form (recovery is restarted from scratch) |
| Sign out → sign in with NEW password | Succeeds |
| Sign out → sign in with OLD password | Fails (Supabase server rejects) |
| Identity Debug snapshot after success | `status: sync_ready` (or `profile_ready`); no leaked recovery scratch |
| Anti-enumeration: timing of "code sent" response | No statistically obvious timing difference between registered and unregistered |

The last row is a soft check; if the timing-side-channel difference is ever
observed to be exploitable, graduate to Option A (custom Edge Functions with
constant-time response).

## Promotion gate

`RECOVERY_FLOW_VERIFIED` may be flipped from `false` to `true` in
`mobileConfig.ts` only when **all of the following** are simultaneously
true:

1. `validate-identity-phase5_0d-recovery.mjs` PASSES.
2. The 5.0B mobile-alignment validator's assert-16 still PASSES with the
   recovery validator wired in.
3. The full identity release gate PASSES.
4. Every row in the live-inbox QA matrix above is recorded as PASS in the
   future Phase 5.0D Closeout doc, with explicit attestation (date, tester,
   device, Supabase project).
5. Explicit phase approval is granted (workflow-gated).

The flag flip is itself a one-line change in `mobileConfig.ts`. It is the
**only** code change that promotes recovery from "implemented but
unreachable" to "live." Reviewers should treat that one-line PR as a major
change and require all five conditions above in the PR description.

## Backwards compatibility

The introduction of recovery must not change the behavior of any existing
identity flow. Concretely:

- `signInWithEmail` (normal email-code sign-in) keeps using
  `signInWithOtp({ email, options: { shouldCreateUser: false } })` and still
  transitions to `email_pending`. The recovery flow uses the same Supabase
  call but the provider transitions to `recovery_code_pending` based on
  which method (request vs signIn) was invoked. The two flows do not share
  client-side state.
- `verifyEmailCode` keeps using `verifyOtp({ ..., type: 'email' })`. The
  recovery flow uses the same call but only when `snapshot.status ===
  'recovery_code_pending'`. The two flows do not share client-side state.
- `signInWithPassword`, `signUpWithPassword`, `verifySignupCode`,
  `refreshSession`, `signOut`, `updateProfile`, `changePassword` are
  unmodified.
- The mock provider's recovery stubs may stay; they are not in the runtime
  path.
- Identity Debug surface is unchanged (recovery actions remain in
  Identity Debug only as raw stubs until the flag flips).

## Files that will be touched (when this spec is implemented)

For traceability — **none of these are touched in this spec doc**. Listed so
the implementation phase has a precise scope.

- `apps/studio-mobile/src/identity/MobileSupabaseProvider.ts`
  (replace 3 stubs; add `recoveryVerified` private flag; add
  `mapRecoveryErrorCode` helper)
- `apps/studio-mobile/src/app/account-identity.tsx`
  (add "Forgot password?" link gated on `RECOVERY_FLOW_VERIFIED`; add
  recovery panel with three stages; add 5 entries to `FRIENDLY_ERRORS`)
- `tools/validation/identity/validate-identity-phase5_0d-recovery.mjs`
  (new validator)
- `tools/validation/identity/run-identity-release-gate.mjs`
  (wire new validator into release + syntax groups; ~2-line diff)
- `tools/validation/identity/validate-identity-phase5_0b-mobile-alignment.mjs`
  (point assert-16 at the new validator's filename; behavior unchanged)
- `apps/studio-mobile/src/identity/mobileConfig.ts`
  (flag stays `false`; flipped only in the future promotion PR)

## Files that will not be touched

- `IdentityContext.tsx` — already exposes `requestRecoveryCode`,
  `verifyRecoveryCode`, `setPasswordAfterRecovery` actions.
- `packages/identity-core/*` — contracts, mock provider, profile/state
  modules unchanged.
- `secureStore.ts`, `mobileStorage.ts`, `selfCheck.ts` — unchanged.
- `identity-debug.tsx` — preserved as QA tool.
- All OAuth code paths.
- All billing surfaces.
- Existing browser-side recovery code paths.

## Out of scope (still deferred beyond v1)

- SMS-based recovery.
- Multi-device recovery codes / backup codes / printed codes.
- WebAuthn / passkeys.
- Recovery email distinct from login email (account profile separation).
- Custom Edge Functions for per-recovery audit and rate-limiting (Option A
  graduation; deferred until v1 produces telemetry justifying it).
- Google OAuth on mobile (separate phase).
- Mobile billing surface.
- Profile-edit affordance.
- TestFlight / production signing & provisioning.

## Spec status summary

This document is a forward-looking specification. As of its creation:

- No code has changed.
- No validators have changed.
- `RECOVERY_FLOW_VERIFIED` remains `false`.
- The user-facing recovery surface remains the calm placeholders shipped in
  5.0C.
- Recovery is unreachable from the UI.

Implementation will be planned, scoped, and approved as a separate phase
following this spec. The future Phase 5.0D Closeout doc will record the
live-inbox QA matrix results and the promotion-PR commit hash.
