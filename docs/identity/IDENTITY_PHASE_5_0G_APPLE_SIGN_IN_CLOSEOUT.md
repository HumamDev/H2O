# Phase 5.0G Mobile Apple Sign-In Closeout

> **Status: DRAFT — pending real iPhone QA.**
> The Phase 5.0G-A dormant implementation is committed
> (`77a824b feat(mobile): add dormant Apple Sign In`); a follow-up provider
> bug fix lives in the working tree (see §"Known implementation fix").
> External Apple Developer + Supabase Apple provider setup is in progress.
> Runtime QA on real iPhone hardware has **not** been performed yet — every
> row in the QA matrix is marked `PENDING`. This document is the gate input
> for the activation commit; activation itself remains future work.

## Summary

Phase 5.0G Apple Sign-In has been implemented end-to-end on the mobile side
as a dormant feature gated behind `APPLE_OAUTH_VERIFIED` in
`apps/studio-mobile/src/identity/mobileConfig.ts`. This document records the
architectural choices that landed, the security posture, and the runtime QA
plan that must pass before the flag is flipped.

`APPLE_OAUTH_VERIFIED` is `false` at rest. The flag will be flipped to `true`
**locally only** for QA and **reverted to `false`** before this closeout
gains its final PASS markers. **Activation (committing the flag flip) is a
separate, not-yet-performed commit** — same posture as Phase 5.0D recovery
activation and Phase 5.0F Google OAuth activation.

QA will be performed against the Supabase project configured by
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the dev
build (project ref `kjwrrkqqtxyxtuigianr`, Cockpit Pro), on a real iPhone
running an Xcode dev-scheme build with Metro running locally. The placeholder
bundle `com.anonymous.studio-mobile` is the QA bundle for 5.0G; the
production reverse-DNS `com.cockpitpro.studio` is deferred to Phase 5.0H
(see §"Deferred work").

## Architecture

**Native iOS Sign in with Apple via `expo-apple-authentication` + Supabase
`signInWithIdToken` + nonce dance.**

1. User taps **Continue with Apple** on the signed-out tab form (the button
   is gated on `APPLE_OAUTH_VERIFIED && Platform.OS === 'ios'` and is placed
   above "Continue with Google" per Apple HIG).
2. `MobileSupabaseProvider.signInWithApple()` calls
   `AppleAuthentication.isAvailableAsync()` as a defensive check;
   non-iOS / unsupported devices return `identity/apple-not-available`.
3. The provider generates a 32-byte random plain-nonce hex string via
   `Crypto.getRandomBytesAsync(32)` and computes its SHA-256 hex digest via
   `Crypto.digestStringAsync(SHA256, …, { encoding: HEX })`. Both values
   stay in local variables; neither is logged or persisted.
4. The provider calls
   `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL],
   nonce: hashedNonceHex })`. iOS shows the **native Apple Sign-In sheet**
   (not a web view); the user authenticates with Face ID / Touch ID / passcode.
5. Apple returns a credential containing `identityToken` (a JWT signed by
   Apple, with the SHA-256 of `nonce` in its `nonce` claim), `fullName` and
   `email` (only on the very first sign-in for a given Apple ID + bundle ID
   pair), and an `authorizationCode`.
6. The provider calls
   `client.auth.signInWithIdToken({ provider: 'apple', token: identityToken,
   nonce: plainNonceHex })` on the **main** Supabase client (no PKCE client
   needed — Apple's flow uses the nonce dance instead of a code-exchange
   verifier).
7. Supabase verifies the JWT signature, the audience claim
   (= the iOS bundle ID), and that SHA-256 of the supplied plain nonce
   matches the JWT's `nonce` claim. On success, Supabase returns a session.
8. The session is persisted via the existing `storeSession()` path: refresh
   token to SecureStore (`expo-secure-store`), access token memory-only.
9. The existing iPhone device-session register hook fires
   (`fireAndForgetRegisterDevice()`), idempotent server-side via the
   `(user_id, device_token_hash)` UNIQUE upsert.
10. `load_identity_state` RPC + `buildSnapshotFromRpc` produce the snapshot;
    `commitSnapshot` finishes the publish; the UI flips to the signed-in
    view, redirecting to `/onboarding` for new users or `/library` for
    returning users.

### First-sign-in display-name capture

Apple returns `fullName` (a `{ givenName, familyName, ... }` object) and
`email` only on the **very first sign-in** for a given Apple ID + bundle ID
pair. Subsequent sign-ins return `null` for both fields. The provider
composes `givenName + familyName` into a single trimmed display-name string
and stashes it on the private `appleFirstSignInDisplayName` field
(memory-only, never logged or persisted) so that
`createInitialWorkspace()` during onboarding can forward it as
`p_display_name` to the `complete_onboarding` RPC. Onboarding-supplied
input still wins — the stash is only a fallback.

The stash is cleared on `signOut()` and after a successful
`createInitialWorkspace()`. If the user revokes the app from
**iOS Settings → Apple ID → Sign-In & Security → Sign in with Apple**,
the next Apple sign-in for that Apple ID is a new "first sign-in" and
returns `fullName` again.

### Email handling

Apple's email is verified by Supabase via the identity token's `email`
claim and persists on `auth.users.email` automatically. The provider does
**not** write the email separately. If the user chose "Hide my email", the
`email` value is an `@privaterelay.appleid.com` relay address — Cockpit
Pro accepts this transparently; outgoing emails (recovery codes, etc.)
reach the user via Apple's relay.

### Why no PKCE client for Apple

The Phase 5.0F Google OAuth flow uses a dedicated PKCE-flow Supabase client
(`getOAuthClient`) because `signInWithOAuth` + `exchangeCodeForSession`
require the same in-memory PKCE verifier across two calls. Apple's flow uses
`signInWithIdToken` (a single call that takes the JWT directly, with the
nonce dance for replay protection), so the main client is sufficient. The
PKCE OAuth client remains in source for Google's exclusive use; Apple does
not touch it.

## Apple Developer setup

| Item | Status | Value |
|---|---|---|
| Apple Developer Program membership (paid) | **PENDING** | team `JDD9465VDA` per `project.pbxproj` `DEVELOPMENT_TEAM` |
| App ID `com.anonymous.studio-mobile` registered | **PENDING** | matches `app.json` `ios.bundleIdentifier` |
| App ID **Sign in with Apple** capability enabled | **PENDING** | required for `expo-apple-authentication` to function on this bundle |
| Apple Team ID captured | **PENDING** | _to be filled after Apple Developer setup_ |
| Sign in with Apple Key (`.p8`) generated | **PENDING** | downloaded once; stored securely |
| Apple Key ID captured | **PENDING** | _to be filled after `.p8` generation_ |
| Provisioning profile updated | **PENDING** | Xcode auto-refreshes on next signed build |

## Supabase Apple provider setup

Project: dev `kjwrrkqqtxyxtuigianr`. Production project setup is deferred
to Phase 5.0H.

| Item | Status | Value |
|---|---|---|
| Authentication → Providers → Apple → Enabled | **PENDING** | _to be confirmed in Supabase dashboard_ |
| Authorized Client IDs | **PENDING** | `com.anonymous.studio-mobile` (must match the iOS bundle exactly; Supabase verifies the JWT `aud` claim against this list) |
| Apple Team ID pasted | **PENDING** | from Apple Developer Membership tab |
| Apple Key ID pasted | **PENDING** | from `.p8` generation page |
| Apple Private Key (`.p8` contents) pasted | **PENDING** | full file contents including `BEGIN`/`END` lines, no leading/trailing whitespace |
| Redirect URLs allow-list | not modified | the existing `studiomobile://identity/oauth/google` entry is for Google PKCE only; native Apple flow does not need a redirect URL |

## Native build setup (one-time)

| Step | Status |
|---|---|
| `npx expo install expo-apple-authentication` (committed in 5.0G-A) | **DONE** in `77a824b` |
| `cd apps/studio-mobile/ios && pod install` (links the native module) | **PENDING** — required before any iOS build can use the Apple SDK |
| `npx expo run:ios --device` (rebuilds dev binary on connected iPhone) | **PENDING** — required so the dormant button is reachable after the local QA flag flip |

`Podfile.lock` will be modified by `pod install`. Decision deferred: the
lock change rides into 5.0G-D cleanup commit or commits separately
alongside the closeout doc.

## Runtime QA matrix

> All rows below are **PENDING** until QA is performed on real iPhone
> hardware. Each row will be updated to `PASS` (or `FAIL` with a
> diagnostic note) after the QA run. The QA run requires §"Apple
> Developer setup" and §"Supabase Apple provider setup" to be complete,
> and the §"Native build setup" `pod install` + dev rebuild to be done.

| # | Scenario | Result |
|---|---|---|
| 1 | Cold-launch dev build, signed out → "Continue with Apple" button visible above "Continue with Google" | **PENDING** |
| 2 | Tap "Continue with Apple" → native iOS Apple Sign-In sheet appears (NOT a web view); Apple ID pre-filled from iCloud | **PENDING** |
| 3 | First sign-in with a fresh Apple ID, share real email | **PENDING** — expect lands signed in, profile.displayName populated from Apple full name, Active Sessions shows iPhone with `This device` pill |
| 4 | Sign out → sign in again with the same Apple ID | **PENDING** — expect lands signed in, displayName preserved server-side, Active Sessions still ONE row (idempotent device register) |
| 5 | First sign-in with a fresh Apple ID #2, choose "Hide my email" | **PENDING** — expect lands signed in with `@privaterelay.appleid.com` email; outgoing recovery email reaches the user via Apple's relay |
| 6 | Cancel mid-flow on the Apple sheet | **PENDING** — expect friendly error "Apple sign-in was cancelled."; signed-out state preserved |
| 7 | Existing email + password sign-in still works | **PENDING** — main client unchanged; no regression expected |
| 8 | Existing email-OTP sign-in still works | **PENDING** — `signInWithOtp` still uses manual-code-entry, not magic-link |
| 9 | Existing Google sign-in still works | **PENDING** — separate PKCE OAuth client, separate provider; no regression expected |
| 10 | Recovery flow (request → email → verify → set new password) still works | **PENDING** |
| 11 | Existing email-account merging: an email account exists with the same Apple-revealed email | **PENDING** — expect Supabase merges on `auth.users.id`; subsequent sign-in via either method works on the same account |
| 12 | Force-quit + relaunch | **PENDING** — expect existing session restores via the refresh-token path; no re-auth required |
| 13 | Metro logs throughout: no `eyJ…` JWT-shaped strings, no `code=…` query params, no plain access/refresh/identity tokens, no plain nonce values, no email values | **PENDING** — verified by visual log scan; all diagnostics scrubbed before this closeout |

## Security and privacy constraints

These constraints are **enforced by source structure** (see §"Validator
coverage") and will be **verified at runtime** during QA (row 13 above).

- **No `identityToken` logging.** The Apple identity token is a JWT
  containing the user's `sub` (Apple ID), `email`, and other claims. It
  must never appear in any `console.*` call, any snapshot field, or any
  persisted storage. Diagnostics during QA may log boolean presence
  (`hasIdentityToken`) but **never** the token value.
- **No `authorizationCode` logging.** Apple's `authorizationCode` is
  unused by the native flow (Supabase verifies the JWT directly) but is
  still part of the Apple response shape. It must never be logged or
  persisted.
- **No nonce logging.** Both `plainNonceHex` and `hashedNonceHex` stay in
  local variables inside `signInWithApple`; neither is logged, persisted,
  or surfaced to any other call site.
- **No raw session / user / provider exposure.** `signInWithApple` returns
  an `IdentitySnapshot` produced by the existing `buildSnapshotFromRpc`
  path — no `rawSession`, `rawUser`, `access_token`, `refresh_token`,
  `provider_token`, `id_token`, `identityToken`, or `authorizationCode`
  fields appear in the return shape. Verified by 5.0G validator §11.
- **Refresh token storage.** Routes through the existing `storeSession()`
  path → `writeRefreshToken()` → `expo-secure-store` (iOS Keychain). Same
  SecureStore key (`h2o.identity.provider.refresh.v1`) and same protections
  as password / email-OTP / Google sign-in. No Apple-specific token storage.
- **Access token.** Memory-only on `this.accessToken`, identical to all
  other auth methods. Never persisted to SecureStore, AsyncStorage, or
  the snapshot.
- **Device-session registration.** The existing
  `fireAndForgetRegisterDevice()` hook fires after `storeSession()`. Same
  idempotent `(user_id, device_token_hash)` UNIQUE upsert as Phase 5.0E
  mobile registration; same surface (`ios_app`), same label
  (`iPhone — Cockpit Pro`), same device-token plaintext stored only in the
  iOS keychain. The SHA-256 of the device token is sent to the server;
  the plain token never leaves the device.
- **First-sign-in `fullName` / `email` capture.** Held in
  `appleFirstSignInDisplayName` (private field) for the duration of the
  onboarding flow only. Cleared on `signOut()` and after successful
  `createInitialWorkspace()`. Never logged, never persisted to SecureStore
  / AsyncStorage / snapshot.
- **No browser-extension / OAuth code path changes.** Phase 5.0G is
  mobile-only. The browser/extension Google OAuth path (Phase 3.9C) is
  unaffected. The 5.0B identity-debug wall is unaffected:
  `identity-debug.tsx` and `settings.tsx` contain no Apple Sign-In
  references (5.0G validator §14 regression check).

## Known implementation fix

A bug in `signInWithApple`'s outer `catch` block was identified during
post-commit self-review and **fixed in the working tree** (not yet
committed):

> **Before:** the catch routed `'identity/apple-cancelled'` and
> `'identity/apple-not-available'` to the mapper's output but flattened
> every other case to `'identity/apple-failed'`, so Apple SDK rate-limit
> (429), network-failure, provider-rejected (403), and invalid-response
> errors all surfaced to the user as the generic "Try again" message
> instead of their specific friendly copy already wired in
> `FRIENDLY_ERRORS` (`'Too many attempts. Wait a moment, then try again.'`,
> `'Network error. Check your connection.'`, `'Request rejected. Try again
> later.'`).
>
> **Root cause:** Apple's `signInAsync` *throws* on error (unlike Google's
> `signInWithOAuth` which returns `{ error, data }`), so explicit per-site
> mapping at the throw point isn't possible — the outer catch must do it.
>
> **Fix:** the catch now passes `mapAppleSignInErrorCode(error)` as the
> `failSoft` fallback for all paths. The `isIdentityError` branch in
> `failSoft` continues to preserve internally-thrown codes (e.g.
> `identity/apple-token-invalid` from the no-`identityToken` path), so no
> regression. All five `identity/apple-*` codes plus the three shared
> `identity/provider-*` codes (rate-limited, network-failed, rejected) are
> now reachable as user-facing codes.

The fix lives in the working tree and rides into the 5.0G-D cleanup commit
(or earlier, at your discretion). 5.0G + 5.0F validators and `tsc --noEmit`
remain clean post-fix.

## Validator coverage

The Phase 5.0G validator
(`validate-identity-phase5_0g-mobile-apple-sign-in.mjs`, 16 sections)
asserts:

1. `mobileConfig.ts` exports `APPLE_OAUTH_VERIFIED` as a boolean literal.
2. `identity-core` `IdentityProvider` interface declares
   `signInWithApple(): Promise<IdentitySnapshot>`; `IdentityChangeSource`
   union includes `'signInWithApple'`; mock provider stub returns
   `identity/apple-not-supported`.
3. `MobileSupabaseProvider.signInWithApple` exists with the correct
   signature.
4. `AppleAuthentication.signInAsync(` and `client.auth.signInWithIdToken(`
   each appear **exactly once** in the provider source and **only inside**
   `signInWithApple`.
5. The `signInWithIdToken` call passes `provider: 'apple'`, a `token`
   value, and a `nonce` value (the plain nonce; Supabase verifies SHA-256
   against the JWT claim).
6. The plain nonce is generated via `Crypto.getRandomBytesAsync` inside
   `signInWithApple`, and SHA-256 hashed via `Crypto.digestStringAsync`
   with `Crypto.CryptoDigestAlgorithm.SHA256` and
   `Crypto.CryptoEncoding.HEX`.
7. No `crypto.subtle.*` calls anywhere in mobile source (Hermes lacks
   WebCrypto on iOS — same constraint as Phase 5.0E device-token hashing).
8. `expo-apple-authentication` is imported only in
   `MobileSupabaseProvider.ts` (NOT in `IdentityContext`,
   `account-identity`, `mobileConfig`, `secureStore`).
9. `expo-apple-authentication` is declared in
   `apps/studio-mobile/package.json`.
10. Mobile-bundle anti-leak: no `console.*` of `identityToken`,
    `authorizationCode`, `appleNonce`, `appleIdToken`, `applePrivateRelay`,
    or `id_token` anywhere in the mobile source.
11. `signInWithApple` return shape contains no raw token / session / user /
    `identityToken` / `authorizationCode` fields.
12. `IdentityContext` declares `signInWithApple` on
    `IdentityContextValue`, defines it via `useCallback` so it routes
    through `runAction`, and calls
    `identityProvider.signInWithApple()`.
13. `account-identity.tsx` imports `APPLE_OAUTH_VERIFIED`, renders
    `"Continue with Apple"` guarded by **both**
    `APPLE_OAUTH_VERIFIED` and `Platform.OS === 'ios'` within ~800 chars,
    and invokes `identity.signInWithApple()` from the button.
14. `identity-debug.tsx` and `settings.tsx` are free of Apple references
    (5.0B identity-debug wall regression check).
15. `app.json` is free of `oauth`, `callback`, `redirect` references
    (5.0B `assertNoOauthCallbackConfig` wall regression check —
    `usesAppleSignIn: true` does not trip the regex).
16. `signInWithApple` reuses `this.storeSession`,
    `this.fireAndForgetRegisterDevice`, and the `load_identity_state` RPC
    (no flow re-implementation).

The validator is wired into
`tools/validation/identity/run-identity-release-gate.mjs` as both a runtime
validator and a syntax-check entry. The 5.0F validator continues to PASS
(no regression), and `tsc --noEmit` on the mobile app remains clean.

## Deferred work

These are **explicitly out of scope** for v1 per the original 5.0G plan
and remain so for this closeout.

- **Production bundle re-key** to `com.cockpitpro.studio` — Phase 5.0H
  TestFlight readiness will rename the bundle ID and the App Group
  (`group.com.anonymous.studio-mobile` → `group.com.cockpitpro.studio`).
  This invalidates the 5.0G-C QA artifacts: a new Apple Developer App ID
  must be registered with Sign in with Apple capability, and the Supabase
  Authorized Client IDs list must add (or replace with) the new bundle.
  One round of **Apple Sign-In re-QA** on the renamed bundle is
  required as part of 5.0H exit criteria.
- **TestFlight readiness** — bundle rename, EAS Build setup, build-number
  strategy, export-compliance flag, internal-tester provisioning, and the
  release-config validator are 5.0H scope. See
  `next-milestone-testflight-readiness-lovely-hinton.md` for the locked-in
  plan.
- **App Store privacy nutrition labels** — App Store Connect → App Privacy
  declarations are configured before any external TestFlight or App Store
  submission. Apple Sign-In adds nothing to the data-collection inventory
  beyond what Google already covers (email, user ID); the on-device
  `PrivacyInfo.xcprivacy` is unchanged.
- **Custom Supabase auth domain** (e.g. `auth.cockpitpro.app`) — Supabase
  Pro-tier feature that replaces the project hostname on web-flow OAuth
  screens. Apple's native flow does not show the Supabase domain at all
  (no web view), so this is a smaller concern after 5.0G ships. Operational
  / branding task, not a security or functional gap.
- **Account-linking UI** — explicit "link Apple to my password account" or
  "unlink Apple" controls. Supabase auto-merges accounts when emails match
  (the typical case; Hide-my-email creates a separate Supabase user that
  cannot auto-merge). Explicit link/unlink is a richer feature deferred to
  a later phase.
- **Hide-my-email management UI** — Apple owns this UX in iOS Settings →
  Apple ID → Sign in with Apple. Cockpit Pro does not replicate it.
- **Android Apple Sign-In** — `expo-apple-authentication` is iOS-only.
  Android could theoretically use a web-flow Apple Sign-In via Supabase's
  OAuth proxy with a Services ID + private key, but that is a separate
  phase and not currently planned.
- **Apple Sign-In Web JS for browser/extension surface** — different
  platform, separate phase.
- **Debug surface Apple controls** — `identity-debug.tsx` remains inert
  per the 5.0B identity-debug wall. Apple Sign-In is exercised through
  `/account-identity` only, same as recovery and Google OAuth.

## Activation note

Activation (committing `APPLE_OAUTH_VERIFIED = true` to `mobileConfig.ts`)
is a **separate, future commit** — not performed by this closeout. The
intended activation commit:

- Touches exactly one file:
  - `apps/studio-mobile/src/identity/mobileConfig.ts` (one-line flip)
- Subject: `feat(mobile): activate Apple Sign-In (5.0G)`
- Pre-commit gate requirements (all must PASS):
  1. `cd apps/studio-mobile && npx tsc --noEmit`
  2. `node tools/validation/identity/validate-identity-phase5_0g-mobile-apple-sign-in.mjs`
  3. `node tools/validation/identity/validate-identity-phase5_0f-mobile-google-oauth.mjs`
  4. `node tools/validation/identity/validate-identity-phase5_0e-device-sessions.mjs`
  5. `node tools/validation/identity/validate-identity-phase5_0d-recovery.mjs`
  6. `node tools/validation/identity/validate-identity-phase5_0b-mobile-alignment.mjs`
  7. `node tools/validation/identity/run-identity-release-gate.mjs`
- Pre-commit gate requirements (real-iPhone QA):
  - Every row in §"Runtime QA matrix" updated to `PASS`.
  - Visual scan of Metro logs during QA confirms no plaintext leaks
    (row 13).
  - This closeout doc updated to remove the DRAFT banner and stamp the
    QA date.

Until that commit lands, the "Continue with Apple" button is hidden in the
signed-out view (the JSX is wrapped in
`{APPLE_OAUTH_VERIFIED && Platform.OS === 'ios' ? (…) : null}`). The
implementation, the validator, the closeout record, and the user-facing
error copy are all in source; only the surface is dormant.

Rollback after activation, if ever needed, is a one-line `mobileConfig.ts`
flip back to `false` — no other change required. The native module, the
nonce-dance helpers, the Apple-specific error mapper, and the Apple
provider call site all remain in source as forward-only infrastructure.
