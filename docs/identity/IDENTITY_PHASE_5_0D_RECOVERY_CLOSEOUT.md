# Phase 5.0D Recovery Closeout

## Status

Phase 5.0D mobile account recovery has been implemented end-to-end and exercised
on real hardware. This document records the live-inbox QA results that gate the
activation step.

`RECOVERY_FLOW_VERIFIED` was flipped to `true` **locally only** during QA and
**reverted to `false`** before this closeout doc was written. **Activation
(flipping the flag in a committed change) is a separate, not-yet-performed
commit.** This doc is the gate input for that activation commit, not the
activation itself.

QA was performed on `2026-05-04` against the Supabase project configured by
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the dev build,
on a real iPhone running an Xcode dev-scheme build, with Metro running locally
on `:8081` against the working tree at `87fa8b7` plus the explicit-feedback
policy patch (uncommitted).

## Live-inbox QA matrix

All rows below were exercised against a real mailbox. Two rows are flagged as
"best-effort" where Supabase OTP cooldown and TTL behavior made fully clean
single-session reproduction impractical; their results are documented honestly.

### Core recovery flow

| # | Scenario | Result |
|---|---|---|
| 1 | Baseline: sign in with current credentials before any recovery | PASS |
| 2 | Sign out, tap "Forgot password?" — recovery panel opens at `request` stage | PASS |
| 3 | Submit empty email → "Enter an email address." | PASS |
| 4 | Submit malformed email → "Enter a valid email address." | PASS |
| 5 | Submit valid registered email → email arrives; UI advances to `verify` stage | PASS |
| 6 | Enter wrong code → friendly error; stays on `verify` stage | PASS |
| 7 | Enter correct code → advances to `set_password` stage | PASS |
| 8 | At `set_password`: empty submit → "Enter a new password." | PASS |
| 9 | At `set_password`: short password (< 8) → "New password must be at least 8 characters." | PASS |
| 10 | At `set_password`: confirm mismatch → "New password and confirmation don't match." | PASS |
| 11 | At `set_password`: valid new password → recovery dismisses; user signed in | PASS |
| 12 | After success: sign out, sign in with **new** password → succeeds | PASS |
| 13 | After success: sign out, sign in with **old** password → fails generically | PASS |
| 14 | Cancel mid-flow at each stage → returns cleanly to tab form, no leaked state | PASS |
| 15 | Force-quit between verify and set-password → recovery restarts from email | PASS |

### Explicit-feedback policy (5.0D v1)

| # | Scenario | Result |
|---|---|---|
| 16 | Submit valid **unregistered** email → UI stays on `request` stage and shows: *"This email is not registered. Please enter a registered email or sign up."* No code is sent. | PASS |
| 17 | Submit valid **registered** email immediately after the unregistered attempt → registered path still works as in row 5 | PASS |

### Backwards-compat / regression checks

| # | Scenario | Result |
|---|---|---|
| 18 | Wrong-password sign-in (registered email) → generic *"Sign in failed. Check your email and password."* — no leakage of "not registered" | PASS |
| 19 | Normal email-code sign-in (`signInWithEmail`) flow still works | PASS |
| 20 | Normal create-account flow still works | PASS |
| 21 | Identity Debug remains inert: recovery actions are not invoked from there | PASS |

### No raw exposure

| # | Scenario | Result |
|---|---|---|
| 22 | Identity Debug snapshot after successful recovery: no raw token / refresh token / password / recovery code visible. Email is masked. `status: sync_ready`. `lastError: None`. | PASS |
| 23 | Metro terminal during the run: no token-shaped strings (no `eyJ…` JWTs, no long base64 bodies) observed in logs | PASS |

### Best-effort rows

These rows depend on Supabase server behavior (OTP TTL, OTP cooldown, single-use
enforcement) that can be slow or rate-limited in a single QA session. Recorded
honestly:

| # | Scenario | Result |
|---|---|---|
| 24 | Enter expired code (≥ documented OTP TTL) → "Your code expired. Request a new one." | BEST-EFFORT — friendly-error path verified by entering an old code from a previous test cycle; full TTL wait not exercised in one session |
| 25 | Reuse a recovery code after success (single-use enforcement) | BEST-EFFORT — Supabase rejected the second-use attempt as expected; full cross-device replay was not exercised |

Both best-effort rows surfaced the expected friendly error copy and did not
crash the app, leak raw state, or persist tokens. They are recorded as
best-effort PASS.

## Explicit product decision: unregistered-email feedback

The recovery request endpoint **intentionally** tells the user when their email
is not registered. This is a deliberate UX/security tradeoff documented in the
5.0D spec under the **Explicit-feedback policy** section.

- **What the user sees**: *"This email is not registered. Please enter a
  registered email or sign up."*
- **Why**: usability — users who mistyped, used the wrong account, or never
  finished sign-up can recover in one click instead of waiting for a code that
  never arrives.
- **What we accept**: the recovery request endpoint can be probed to confirm
  whether an email is registered. Threat model is comparable to that of
  `signInWithPassword` (which already surfaces "wrong password" vs other
  failures distinguishably via Supabase defaults).

This policy applies **only** to the mobile recovery request surface. Other
surfaces remain stricter:

- Mobile sign-in (`signInWithEmail` / `signInWithPassword`): generic copy only.
- Mobile sign-up: may surface "already registered" and suggest sign-in.
- Public website / marketing flows: reserved for stricter anti-enum copy when
  that surface ships.

A future graduation back to anti-enumeration is supported as a forward-only
internal change (custom Edge Functions, or a single UI copy revert) — see the
5.0D spec § Future graduation path.

## Security constraints (verified during QA)

- **`RECOVERY_FLOW_VERIFIED = false`** at rest. The flag was flipped to `true`
  locally only during QA, never staged, and reverted to `false` before this
  doc was written.
- **No `resetPasswordForEmail`** anywhere in mobile source — verified by the
  5.0D validator's assert-5 (grep returns 0 hits).
- **No `type: 'recovery'`** anywhere in mobile source — verified by the 5.0D
  validator's assert-6 (grep returns 0 hits for `type: 'recovery'` and
  `type: 'recovery_code'`).
- **Recovery scratch tokens are memory-only.** `recoveryAccessToken` and
  `recoveryRefreshToken` are never written to SecureStore; `writeSnapshot` is
  called by `failSoft` to record `lastError`, but the snapshot does not
  contain tokens. The first SecureStore write happens **only** on successful
  `setPasswordAfterRecovery`, when the recovery scratch graduates to a normal
  persisted session via `storeSession`. Verified by 5.0D validator asserts 2,
  3, and 4.
- **No raw password / token / session / user object surfaced** to the UI, to
  Identity Debug, to logs, or to `snapshot.lastError.detail`. `failSoft`
  deliberately omits the `detail` argument when constructing
  `IdentityErrorShape` for recovery operations. Verified by 5.0D validator
  assert-8 (no `console.*` of password / scratch-token identifiers) and by
  runtime row 22 above.
- **Identity Debug remains inert** with respect to recovery. Recovery actions
  are not callable from the QA debug surface. Verified by the 5.0B (relaxed)
  validator's assert-16 carry-forward.
- **Normal sign-in behavior unchanged.** `signInWithEmail`, `verifyEmailCode`,
  `signInWithPassword`, `signUpWithPassword`, `verifySignupCode`,
  `refreshSession`, `signOut`, `updateProfile`, and `changePassword` are all
  unmodified. Verified by row 18 (wrong-password sign-in stays generic) and
  rows 19–20 (sign-in / sign-up flows unchanged).

## Activation note

Activation (committing `RECOVERY_FLOW_VERIFIED = true` to `mobileConfig.ts`)
is a **separate, future commit** — not performed by this closeout. The
intended activation commit:

- Touches exactly two files:
  - `apps/studio-mobile/src/identity/mobileConfig.ts` (one-line flip)
  - `docs/identity/IDENTITY_PHASE_5_0D_RECOVERY_CLOSEOUT.md` (this doc)
- Subject: `feat(mobile): activate account recovery (5.0D)`
- Pre-commit gate requirements (all must PASS):
  1. `cd apps/studio-mobile && npx tsc --noEmit`
  2. `node tools/validation/identity/validate-identity-phase5_0d-recovery.mjs`
  3. `node tools/validation/identity/validate-identity-phase5_0b-mobile-alignment.mjs`
     (the relaxed assert-16 reads this doc and accepts the flag flip because
     this doc contains the literal phrases `Phase 5.0D Recovery Closeout`,
     `Live-inbox QA`, and `PASS`)
  4. `node tools/validation/identity/run-identity-release-gate.mjs`

Until that commit lands, the recovery surface remains unreachable from the UI
(the "Forgot password?" link short-circuits to `null` while the flag is
`false`). The implementation, the spec, the validator, and this closeout
record are all in source; only the surface is dormant.

Rollback after activation, if ever needed, is a one-line `mobileConfig.ts`
flip back to `false` — no other change required.
