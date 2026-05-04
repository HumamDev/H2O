# Phase 5.0F Mobile Google OAuth Closeout

## Summary

Phase 5.0F mobile Google OAuth has been implemented end-to-end and exercised
on real hardware. This document records the runtime QA and the architectural
choices that landed.

`GOOGLE_OAUTH_VERIFIED` is `false` at rest. The flag was flipped to `true`
**locally only** for QA and **reverted to `false`** before this closeout doc
was written. **Activation (committing the flag flip) is a separate,
not-yet-performed commit** — same posture as Phase 5.0D recovery activation.
This doc is the gate input for that activation commit, not the activation
itself.

QA was performed on `2026-05-05` against the Supabase project configured by
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the dev build
(project ref `kjwrrkqqtxyxtuigianr`, Cockpit Pro), on a real iPhone running an
Xcode dev-scheme build, with Metro running locally.

## OAuth architecture

**Supabase as OAuth proxy + PKCE flow + `WebBrowser.openAuthSessionAsync`**

1. User taps **Continue with Google** on the signed-out tab form.
2. `MobileSupabaseProvider.signInWithGoogle()` calls
   `client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo,
   skipBrowserRedirect: true } })` on a dedicated PKCE-flow client. The SDK
   generates a PKCE code verifier, stores it in the client's in-memory
   storage, and returns the Supabase auth URL.
3. The provider opens the URL via
   `WebBrowser.openAuthSessionAsync(authUrl, redirectTo, { preferEphemeralSession: true })`.
   On iOS this uses `ASWebAuthenticationSession` with an isolated cookie jar,
   suppressing the iOS "Wants to Use 'supabase.co' to Sign In" cookie-sharing
   prompt.
4. The user authenticates with Google in the in-app browser; Google redirects
   back to Supabase; Supabase issues the session and redirects to the mobile
   app's custom URL scheme.
5. `openAuthSessionAsync` resolves with `{ type: 'success', url: '<callback url>' }`.
   The provider parses the auth code from the redirect URL — checking
   `searchParams.get('code')` first and falling back to the URL hash fragment
   (`#code=…`) for Supabase configurations that route through the fragment.
6. The provider calls `client.auth.exchangeCodeForSession(code)` on the
   **same** PKCE client — the in-memory verifier is read back to complete
   the exchange. The full URL stays only in a local variable; the parsed
   `code` is forwarded to `exchangeCodeForSession` and immediately discarded.
7. The session is persisted via the existing `storeSession()` path: refresh
   token to SecureStore (`expo-secure-store`), access token memory-only.
8. The existing iPhone device-session register hook fires
   (`fireAndForgetRegisterDevice()`), idempotent server-side via the
   `(user_id, device_token_hash)` UNIQUE upsert.
9. `load_identity_state` RPC + `buildSnapshotFromRpc` produce the snapshot;
   `commitSnapshot` finishes the publish; the UI flips to the signed-in view.

A **dedicated PKCE-flow OAuth client** (`getOAuthClient`) is held alongside
the main client. The main client keeps default (implicit-flow) auth options
because flipping it to PKCE would change `signInWithOtp` from a
manual-code-entry flow into a magic-link flow, breaking the existing email
sign-in and recovery surfaces. The two clients share the same Supabase URL +
anon key but differ only in `flowType`.

## Redirect URI

```
studiomobile://identity/oauth/google
```

Defined as `MOBILE_OAUTH_REDIRECT_URI` in `MobileSupabaseProvider.ts` and
referenced in exactly two places: the `signInWithOAuth` `redirectTo` option
and the `WebBrowser.openAuthSessionAsync` second argument. The 5.0F validator
asserts the literal appears exactly once in the provider source and **does
not appear** in `IdentityContext.tsx`, `account-identity.tsx`, or
`mobileConfig.ts`.

## Supabase redirect allow-list (confirmed)

Verified during runtime QA: the Supabase project's Authentication → URL
Configuration → Redirect URLs allow-list includes
`studiomobile://identity/oauth/google`. Without this entry, the redirect was
observed to come back without a `code` and without an `error` — the symptom
that surfaced the now-distinct
`identity/oauth-callback-no-code-no-error` error code during diagnosis.

The allow-list was already populated before QA started; no allow-list change
was needed during QA itself.

## Google Cloud OAuth client (unchanged)

```
Authorized redirect URIs:
  https://kjwrrkqqtxyxtuigianr.supabase.co/auth/v1/callback
```

The mobile custom scheme `studiomobile://identity/oauth/google` is **not**
registered in Google Cloud and **does not need to be**. Supabase brokers the
OAuth flow on the server side: Google sees only the Supabase callback URL,
hands the user back to Supabase, and Supabase then redirects to the mobile
scheme. No "Authorized JavaScript origins" entry is required for this flow.

## Runtime QA matrix (PASS on 2026-05-05)

| # | Scenario | Result |
|---|---|---|
| 1 | Cold-launch dev build, signed out → "Continue with Google" button visible above email field | PASS — flag flipped to true locally |
| 2 | Tap "Continue with Google" → ASWebAuthenticationSession opens with Google account chooser | PASS — no iOS "supabase.co" cookie-sharing prompt thanks to `preferEphemeralSession: true` |
| 3 | Sign in with a registered Google account that already has a Supabase profile | PASS — returns to app signed in |
| 4 | Active Sessions on iPhone after step 3 | PASS — shows iPhone with `This device` pill |
| 5 | Sign out, tap "Continue with Google" again with the same account | PASS — faster sign-in; no duplicate device-session row |
| 6 | Cancel mid-flow on the Google account chooser | PASS — friendly error "Google sign-in was cancelled."; signed-out state preserved |
| 7 | Existing email + password sign-in still works | PASS — main client retains implicit-flow defaults |
| 8 | Existing email-OTP sign-in still works | PASS — `signInWithOtp` still uses manual-code-entry, not magic-link |
| 9 | Recovery flow (`signInWithOtp` for password reset) still works | PASS — recovery routed through the main client with implicit defaults |
| 10 | No `eyJ…` JWTs, no `code=…` query strings, no plain access/refresh tokens, no email values appeared in Metro logs | PASS — all diagnostics scrubbed before this closeout |

## Known branding note: Google sign-in shows the Supabase domain

When the user authenticates with Google, the Google sign-in page reads:

> *to continue to `kjwrrkqqtxyxtuigianr.supabase.co`*

This is **expected** because Supabase is the OAuth broker — Google sees only
the Supabase callback URL, so it shows the Supabase project hostname as the
"continuing to" target. The user briefly sees the unbranded Supabase project
domain instead of the H2O Cockpit Pro brand.

**Future production fix**: configure a Supabase custom domain (e.g.
`auth.cockpitpro.app`) so the Google sign-in screen shows the H2O brand. This
is a Supabase Pro-tier feature and a separate operational task — **explicitly
not required for v1**. The current behavior is a minor UX rough edge but
does not affect security or functionality.

## Security and privacy constraints (verified during QA)

- **No auth code logging.** The redirect URL's `code` parameter is parsed
  into a local variable, forwarded to `exchangeCodeForSession`, and discarded.
  Diagnostics during QA logged only **boolean presence** (`hasQueryCode`,
  `hasHashCode`) and parsed parts (`scheme`, `host`, `path`) — never the code
  value. All such diagnostics were removed before this closeout.
- **No token logging.** Access token, refresh token, ID token, and provider
  token never appear in any `console.*` call in the mobile bundle. Verified
  by the 5.0F validator's client-bundle anti-leak guard, which forbids
  `oauthCode|authCode|oauthState|oauthUrl|providerToken|provider_token|id_token|idToken`
  in `console.*` argument context.
- **No raw session/user exposure.** `signInWithGoogle` returns an
  `IdentitySnapshot` produced by the existing `buildSnapshotFromRpc` path —
  no `rawSession`, `rawUser`, `access_token`, `refresh_token`, `provider_token`,
  or `id_token` fields appear in the return shape. Verified by 5.0F validator
  assert §9.
- **Refresh token storage**: routes through the existing `storeSession()`
  path → `writeRefreshToken()` → `expo-secure-store`. Same SecureStore key
  (`h2o.identity.provider.refresh.v1`) and same protections as password /
  email-OTP sign-in. No separate OAuth-specific token storage.
- **Access token**: kept memory-only on `this.accessToken`, identical to all
  other auth methods.
- **Device-session registration**: the existing `fireAndForgetRegisterDevice()`
  hook fires after `storeSession()`. Same idempotent
  `(user_id, device_token_hash)` UNIQUE upsert as Phase 5.0E mobile registration;
  same surface (`ios_app`), same label (`iPhone — Cockpit Pro`), same
  device-token plaintext stored only in the iOS keychain.
- **PKCE verifier**: held only in the OAuth client's in-memory storage
  between `signInWithOAuth` and `exchangeCodeForSession`. Never written to
  SecureStore, never logged.
- **No browser-extension / OAuth code path changes.** Phase 5.0F is mobile-only.
  The browser/extension Google OAuth path (Phase 3.9C) is unaffected.

## Validator coverage

The Phase 5.0F validator (`validate-identity-phase5_0f-mobile-google-oauth.mjs`)
asserts:

1. `mobileConfig.ts` exports `GOOGLE_OAUTH_VERIFIED` as a boolean literal.
2. `identity-core` `IdentityProvider` interface declares
   `signInWithGoogle(): Promise<IdentitySnapshot>`; mock provider stub
   returns `identity/oauth-not-supported`.
3. `MobileSupabaseProvider.signInWithGoogle` exists with the correct
   signature.
4. `client.auth.signInWithOAuth(`, `client.auth.exchangeCodeForSession(`,
   and `WebBrowser.openAuthSessionAsync(` each appear **exactly once** in
   the provider source and **only inside** `signInWithGoogle`.
5. The `signInWithOAuth` call passes `provider: 'google'`,
   `skipBrowserRedirect: true`, and `redirectTo: MOBILE_OAUTH_REDIRECT_URI`.
6. The redirect URI literal `studiomobile://identity/oauth/google` appears
   exactly once in `MobileSupabaseProvider.ts` and **does not appear** in
   `IdentityContext.tsx`, `account-identity.tsx`, or `mobileConfig.ts`.
7. `expo-web-browser` is imported only in `MobileSupabaseProvider.ts`.
8. Client-bundle anti-leak: no `console.*` of OAuth tokens / codes / state
   shaped names anywhere in the mobile source.
9. `signInWithGoogle` return shape contains no raw token / session / user
   fields.
10. `IdentityContext` exposes `signInWithGoogle` via `useCallback` →
    `runAction` → `identityProvider.signInWithGoogle()`.
11. `account-identity.tsx` imports `GOOGLE_OAUTH_VERIFIED` and renders the
    "Continue with Google" button gated by it (anchor check within ~800
    chars of the button literal).
12. `identity-debug.tsx` and `settings.tsx` remain free of OAuth references
    (regression check protecting the 5.0B identity-debug wall).

## Deferred work

These are **explicitly out of scope** for v1 per the original 5.0F plan.

- **Apple Sign In** — required by Apple's App Store Review Guidelines for
  apps that offer third-party sign-in (Google included), but **not required
  for TestFlight or dev builds**. A 5.0G Apple Sign In phase will likely
  precede App Store submission.
- **Custom auth domain** (e.g. `auth.cockpitpro.app`) — Supabase Pro-tier
  feature that replaces the project hostname on the Google sign-in screen.
  Operational/branding task, not a security or functional gap.
- **Provider linking UI** — explicit "link Google to my password account" or
  "unlink Google" controls. Supabase already merges accounts when the
  Google email matches an existing password account; explicit link/unlink
  controls are a richer feature deferred to a later phase.
- **Microsoft / GitHub / other OAuth providers** — each its own future phase.
- **Android testing** — implementation works in code (`WebBrowser.openAuthSessionAsync`
  uses CustomTabs on Android), but no formal QA was performed on Android.
- **Expo Web testing** — the popup-based fallback works, but not in scope.
- **Debug surface OAuth controls** — `identity-debug.tsx` remains inert per
  the 5.0B identity-debug wall. OAuth is exercised through `/account-identity`
  only, same as recovery.

## Activation note

Activation (committing `GOOGLE_OAUTH_VERIFIED = true` to `mobileConfig.ts`)
is a **separate, future commit** — not performed by this closeout. The
intended activation commit:

- Touches exactly one file:
  - `apps/studio-mobile/src/identity/mobileConfig.ts` (one-line flip)
- Subject: `feat(mobile): activate Google OAuth (5.0F)`
- Pre-commit gate requirements (all must PASS):
  1. `cd apps/studio-mobile && npx tsc --noEmit`
  2. `node tools/validation/identity/validate-identity-phase5_0f-mobile-google-oauth.mjs`
  3. `node tools/validation/identity/validate-identity-phase5_0e-device-sessions.mjs`
  4. `node tools/validation/identity/validate-identity-phase5_0d-recovery.mjs`
  5. `node tools/validation/identity/validate-identity-phase5_0b-mobile-alignment.mjs`
  6. `node tools/validation/identity/run-identity-release-gate.mjs`

Until that commit lands, the "Continue with Google" button is hidden in the
signed-out view (the JSX is wrapped in `{GOOGLE_OAUTH_VERIFIED ? (…) : null}`).
The implementation, the validator, and this closeout record are all in
source; only the surface is dormant.

Rollback after activation, if ever needed, is a one-line `mobileConfig.ts`
flip back to `false` — no other change required. The PKCE OAuth client,
`preferEphemeralSession`, hash/query callback parsing, and the three
specific OAuth-callback error codes all remain in source as forward-only
infrastructure.
