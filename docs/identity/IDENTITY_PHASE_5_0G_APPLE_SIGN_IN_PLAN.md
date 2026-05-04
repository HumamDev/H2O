# Phase 5.0G Apple Sign In — Plan

> Forward-only planning doc. No code has been written yet. This doc gates the
> implementation phases that follow.

## 1. Why Apple Sign In is next

Apple App Store Review Guideline 4.8 ("Login Services") requires that any iOS
app offering third-party login from a major social provider (Google, Facebook,
etc.) **must also offer Sign in with Apple** as one of the equivalent options.
Phase 5.0F shipped Google sign-in on mobile, which means **App Store
submission is now blocked until Apple Sign In ships**.

Adjacent priorities — sign-out-of-all-other-devices, per-device revoke, avatar
upload, billing — do not block App Store distribution and can defer behind
this milestone. TestFlight readiness audit (the natural follow-up phase) also
depends on having both OAuth providers in place.

The implementation pattern is **near-identical to Phase 5.0F**: dormant flag
gate, Supabase as the auth backend, dormant→QA-flip→closeout→activation
sequence, the same SecureStore + access-token-memory-only model, the same
device-session registration on success. Most of the 5.0F validator and UI
scaffolding can be templated rather than rewritten.

## 2. Architecture options

### Option A — Native via `expo-apple-authentication`

iOS shows the system Apple Sign In sheet directly (not a web view). The
flow:

1. Generate a random nonce (32 random bytes → 64-char hex).
2. SHA-256 hash the nonce → pass the hash as `AppleAuthentication.signInAsync({ nonce })`.
3. iOS shows the system Apple sheet → user authenticates.
4. iOS returns `{ identityToken, authorizationCode, fullName, email, realUserStatus }`.
   - `identityToken` is a JWT signed by Apple, including the SHA-256 nonce hash claim.
   - `email` and `fullName` are present **only on first sign-in for the user/app pair**; subsequent sign-ins return `null` for these fields.
5. Provider calls `client.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: <plain-nonce> })`. Supabase verifies the JWT signature, the audience claim (must match Bundle ID), and that the SHA-256 of the supplied plain nonce matches the JWT's `nonce` claim.
6. Supabase returns a session → existing `storeSession()` path takes over.

**Pros**: native iOS experience (no web view, no iOS cookie-sharing prompt, pre-filled with the user's iCloud identity, automatic biometric prompts). HIG-compliant Apple-branded button. Strongest replay protection via the nonce dance. Apple recommends this path for native iOS apps.

**Cons**: adds the `expo-apple-authentication` native dependency (requires `pod install` + native rebuild). First-sign-in-only `email`/`fullName` requires the app to **persist them on first sign-in** — if the user revokes and re-grants, you don't get them back unless they explicitly sign out from Settings → Apple ID. We must capture these on the first response and forward to Supabase / our `complete_onboarding` flow.

### Option B — Supabase OAuth proxy (web flow, mirrors 5.0F)

Same pattern as Google: `client.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo, skipBrowserRedirect: true } })` → `WebBrowser.openAuthSessionAsync` → `exchangeCodeForSession`.

**Pros**: zero new native dependency. Reuses the 5.0F PKCE OAuth client + WebBrowser pattern verbatim. Implementation is ~70% copy-paste from `signInWithGoogle`.

**Cons**: web view-based UX (Apple's web-flow sign-in page, less integrated). Requires creating a **Services ID** in Apple Developer + private signing key + return URL allow-listing. iOS cookie-sharing prompt may appear (mitigated by `preferEphemeralSession: true` as we do for Google). Apple's HIG explicitly prefers the native button for native apps; using a custom web-OAuth button on iOS can draw reviewer scrutiny (though not auto-rejection).

## 3. Recommended option: **Native (Option A)**

**Reasons**:

- **Apple HIG compliance.** Apple recommends — and reviewers expect — the native `ASAuthorizationAppleIDButton` on iOS apps. Web-flow Apple Sign In on iOS is unusual and looks "wrapped".
- **Better UX.** No web view, no system cookie-sharing prompt, faster, identity is pre-filled from iCloud, biometric (Face ID / Touch ID) prompts automatically on supported devices.
- **Stronger replay protection.** The nonce flow built into the native API binds a single sign-in attempt to a single token. (Web flow uses PKCE, which is also strong but different threat model.)
- **Smaller diff to Supabase config.** Native flow only needs the App ID's Sign in with Apple capability + bundle ID match. Web flow additionally needs a Services ID + private key + return URL.
- `expo-crypto` is already a dependency (added in Phase 5.0E for SHA-256 device-token hashing), so the nonce hash needs no new package.

The new native module adds modest weight: one `pod install` + Xcode rebuild on the next dev-build cycle. We accepted the same friction for `expo-crypto` in 5.0E.

**Fallback**: if Apple Developer setup is blocked (account expired, team agreements, etc.), we can ship Option B with an `apple-web-fallback` flag, but this should be a last resort.

## 4. Required Apple Developer setup (for Option A)

1. **Active Apple Developer Program membership.** Required to enable the Sign in with Apple capability and to ship to TestFlight / App Store.
2. **App ID** with **Sign in with Apple** capability enabled.
   - Apple Developer Console → Certificates, Identifiers & Profiles → Identifiers → choose your App ID → Capabilities → Sign in with Apple → enable + Save.
   - Bundle ID **must match** the iOS app's bundle. Current `app.json` has `"bundleIdentifier": "com.anonymous.studio-mobile"` — this **placeholder bundle is acceptable for personal dev/TestFlight but is NOT acceptable for App Store**. A pre-Phase-5.0G bundle change to a real reverse-DNS like `app.cockpitpro.studio` may be required, and that is a coordinated change across `app.json` + Apple Developer + provisioning profiles. Decision punt: see § Risks.
3. **Services ID**: **NOT REQUIRED** for native flow. Skip unless we choose Option B as fallback.
4. **Return URL / callback URL**: **NOT REQUIRED** for native flow. iOS returns the identity token directly to the app via the native sign-in sheet.
5. **Provisioning profile / entitlements**: Xcode adds the `com.apple.developer.applesignin` entitlement automatically when the capability is enabled in `app.json`. Expo prebuild generates the entitlements from `app.json`.

In `app.json` we'll add the capability declaration:
```json
{
  "expo": {
    "ios": {
      "usesAppleSignIn": true,
      ...
    }
  }
}
```
The 5.0B validator's `assertNoOauthCallbackConfig(appJson)` blocks OAuth strings in `app.json`. The literal `usesAppleSignIn` does not match the `\boauth\b` regex (no "oauth" substring), and `\b(callback|redirect|scheme)\b` keys aren't introduced. Plan: confirm during implementation; if a wall fires, halt and request relaxation rather than weaken silently.

## 5. Required Supabase setup

Configure in Supabase Dashboard → Authentication → Providers → Apple:

1. **Enable** the Apple provider.
2. **Apple Services ID**: For **native flow with `signInWithIdToken`**, Supabase actually only needs the Apple **Team ID** + **Key ID** + **Private Key (.p8)** + **App Bundle ID** as the audience. The Services ID field can be left blank or set to the bundle ID per Supabase docs.
3. **Authorized Client IDs**: enter the iOS app's bundle ID (e.g. `app.cockpitpro.studio` once finalized). Supabase will validate this against the `aud` claim of the Apple identity token.
4. **Redirect URLs**: **No new entries needed** for native flow — the redirect URL allow-list is for web OAuth flows. Existing `studiomobile://identity/oauth/google` stays.

**Apple Private Key generation**: Apple Developer Console → Certificates, Identifiers & Profiles → Keys → "+" → enable "Sign in with Apple" → choose the App ID → download the `.p8`. Upload its contents (or paste) into the Supabase Apple provider config along with Key ID and Team ID. This key signs Supabase's authentication of the user with Apple.

## 6. Files likely to touch

| File | Change |
|---|---|
| `apps/studio-mobile/package.json` | Add `expo-apple-authentication` (~`55.0.x` for SDK 55) |
| `apps/studio-mobile/package-lock.json` | Auto-updated by `npx expo install expo-apple-authentication` |
| `apps/studio-mobile/ios/Podfile.lock` | Updated by `pod install` after the SDK adds the new pod |
| `apps/studio-mobile/app.json` | Add `"ios": { "usesAppleSignIn": true }` |
| `apps/studio-mobile/src/identity/mobileConfig.ts` | Export `APPLE_OAUTH_VERIFIED = false` (initial) |
| `apps/studio-mobile/src/identity/MobileSupabaseProvider.ts` | New `signInWithApple()` method using `expo-apple-authentication` + nonce hashing via `Crypto.digestStringAsync` + `client.auth.signInWithIdToken`; error mapper for Apple-specific error codes; persist `email` + `fullName` if present on first sign-in (passing them through to `complete_onboarding`); existing `storeSession`/`fireAndForgetRegisterDevice`/`load_identity_state` path |
| `packages/identity-core/src/contracts.ts` | Add `signInWithApple(): Promise<IdentitySnapshot>` to `IdentityProvider` interface; add `'signInWithApple'` to `IdentityChangeSource` |
| `packages/identity-core/src/mock-provider.ts` | Stub returning `identity/apple-not-supported` |
| `apps/studio-mobile/src/identity/IdentityContext.tsx` | Expose `signInWithApple` via `runAction` |
| `apps/studio-mobile/src/app/account-identity.tsx` | "Continue with Apple" button gated on `APPLE_OAUTH_VERIFIED`, placed alongside Google. New friendly errors: `identity/apple-cancelled`, `identity/apple-failed`, `identity/apple-token-invalid`, `identity/apple-not-supported`, `identity/apple-not-available` |
| `tools/validation/identity/validate-identity-phase5_0g-mobile-apple-sign-in.mjs` | **New** validator — see § 10 |
| `tools/validation/identity/run-identity-release-gate.mjs` | Wire 5.0G validator into release group + syntax-check group |

No changes anticipated to: identity-debug.tsx, settings.tsx, browser/extension OAuth path, billing, recovery, device-session schema, validators outside identity.

## 7. Feature flag strategy

Mirrors the 5.0D recovery and 5.0F Google patterns exactly.

- **Phase A**: dormant implementation. `APPLE_OAUTH_VERIFIED = false` in `mobileConfig.ts`. The "Continue with Apple" button is wrapped in `{APPLE_OAUTH_VERIFIED ? (…) : null}` — provider method exists but is unreachable from the UI. Validator + closeout doc + everything else lands. Commit subject: `feat(mobile): add dormant Apple sign-in`.
- **Phase B (external)**: complete the Apple Developer + Supabase Dashboard setup steps from § 4 + § 5. **Outside the repo** — operational task.
- **Phase C (local QA)**: temporarily flip `APPLE_OAUTH_VERIFIED = true` locally, **never staged**. Run the iPhone QA matrix from § 11 against a test Apple ID. Capture results.
- **Phase D**: cleanup pass + closeout doc creation. `IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_CLOSEOUT.md` records the runtime QA matrix and security verifications. Commit subject: `chore(mobile): finalize Apple sign-in implementation`. Flag stays `false` in this commit.
- **Phase E**: activation commit, single-line flag flip (`false` → `true`). Subject: `feat(mobile): activate Apple sign-in (5.0G)`.

Total: 3 commits + 1 external setup step. Same cadence as 5.0F.

## 8. UI plan

**Placement**: above the existing "Continue with Google" button so the order on iOS is: **Apple → Google → email**. Apple HIG explicitly prefers Sign in with Apple to be at least as prominent as competing sign-in options; placing it first satisfies that.

**Button visual rules** (Apple HIG):
- Black, white, or white-with-outline background — no custom colors.
- Apple logo glyph on the left, never substituted or recolored.
- Localized text: "Sign in with Apple" or "Continue with Apple". We'll use **"Continue with Apple"** for parity with the Google button copy.
- Minimum 44pt height, rounded corners, system font.
- Either use the `AppleAuthentication.AppleAuthenticationButton` component from `expo-apple-authentication` (gives the official Apple-rendered button automatically) **or** a styled `TouchableOpacity` matching HIG. The expo-provided component is preferred for review compliance — minimal risk of HIG violation.

**Divider**: the existing "or use email" divider stays beneath the OAuth buttons. New layout in the signed-out form:
```
┌──────────────────────────────────┐
│   ⌥  Continue with Apple         │  ← gated on APPLE_OAUTH_VERIFIED
├──────────────────────────────────┤
│   G  Continue with Google        │  ← gated on GOOGLE_OAUTH_VERIFIED
├────────── or use email ──────────┤
│  EMAIL field                     │
│  PASSWORD field                  │
│  …                               │
└──────────────────────────────────┘
```

When **only one** of the OAuth flags is true, the corresponding button shows alone above the divider. When **both** are false (initial state in production until activation), the divider hides too — reverts to the pure email-only form we have today.

## 9. Security constraints

Mirror the 5.0F posture exactly.

- **No identity-token logging.** The Apple identity token is a JWT containing the user's `sub` (Apple ID), `email`, and other claims. It must never appear in any `console.*` call, any snapshot field, or any persisted storage. Diagnostics during QA may log boolean presence (`hasIdentityToken`) but never the token value.
- **No authorization-code logging.** `authorizationCode` from the native Apple response is also never logged.
- **No nonce logging.** The plain nonce stays in a local variable through `signInWithIdToken` and is then discarded. Only its derivation method is documented in source comments, never the value.
- **No raw session/user/provider exposure** in `signInWithApple`'s return shape. Same `buildSnapshotFromRpc` path as all other auth methods produces the public `IdentitySnapshot`.
- **Refresh token persistence**: routes through the existing `storeSession()` → `writeRefreshToken()` → `expo-secure-store`. Same SecureStore key (`h2o.identity.provider.refresh.v1`) and same protections as password / email-OTP / Google sign-in. No Apple-specific token storage.
- **Access token**: kept memory-only on `this.accessToken`, identical to all other auth methods.
- **Device-session registration**: the existing `fireAndForgetRegisterDevice()` hook fires after `storeSession()`. Same idempotent upsert as 5.0E mobile registration; same surface (`ios_app`), same label (`iPhone — Cockpit Pro`).
- **First-sign-in `email` and `fullName` handling**: Apple returns these only the very first time a user signs in. If we receive them, they must flow through to the existing `complete_onboarding` RPC (display name = full name first+last; email persists in the Supabase `auth.users.email` field automatically since Supabase verifies the identity token). Subsequent sign-ins return `null` — Supabase's stored email/name are authoritative, so this is fine. Apple's "Hide my email" feature returns a `@privaterelay.appleid.com` address; we accept this as the user's email and don't try to unmask it.
- **No email leakage in console.*** matching the 5.0E/5.0F anti-leak guard, extended to include Apple-specific identifiers (`identityToken`, `authorizationCode`, `applePrivateRelay`, `appleNonce`).
- **`identity-debug.tsx` / `settings.tsx` remain inert** with respect to Apple Sign In. Same regression check as 5.0F.

## 10. Validator plan

New validator: `tools/validation/identity/validate-identity-phase5_0g-mobile-apple-sign-in.mjs`. Same shape as the 5.0F validator. Asserts:

1. `mobileConfig.ts` exports `APPLE_OAUTH_VERIFIED` as a boolean literal (Phase A: false; activation commit later flips to true).
2. `identity-core` `IdentityProvider` interface declares `signInWithApple(): Promise<IdentitySnapshot>`; mock provider stub returns `identity/apple-not-supported`.
3. `MobileSupabaseProvider.signInWithApple()` exists with correct signature.
4. `AppleAuthentication.signInAsync(` and `client.auth.signInWithIdToken(` each appear **exactly once** in the provider source and **only inside** `signInWithApple`.
5. The `signInWithIdToken` call passes `provider: 'apple'`, an `idToken` value derived from the Apple response, and a non-empty `nonce` matching the SHA-256 hash sent to Apple.
6. The plain nonce is generated via `Crypto.getRandomBytesAsync(...)` and hashed via `Crypto.digestStringAsync(SHA256, …, { encoding: HEX })`. No `crypto.subtle.*` calls (Hermes lacks WebCrypto on iOS — same constraint as Phase 5.0E).
7. `expo-apple-authentication` is imported only in `MobileSupabaseProvider.ts`.
8. Mobile-bundle anti-leak: no `console.*` of `identityToken|authorizationCode|appleNonce|applePrivateRelay|appleIdToken` anywhere in the mobile source. Extends the 5.0F + 5.0E client-bundle guard with these new forbidden words.
9. `signInWithApple`'s return shape contains no raw token / session / user / identity-token fields.
10. `IdentityContext` exposes `signInWithApple` via `runAction` → `identityProvider.signInWithApple()`.
11. `account-identity.tsx` imports `APPLE_OAUTH_VERIFIED` and renders the "Continue with Apple" button gated by it (anchor check within ~800 chars of the button literal).
12. `identity-debug.tsx` and `settings.tsx` remain free of Apple Sign In references (regression check protecting the 5.0B identity-debug wall).
13. `app.json` may include `"usesAppleSignIn": true` under `ios` — verify this string does NOT match the existing 5.0B `assertNoOauthCallbackConfig` regex, which checks for `\boauth\b` / `\bcallback\b`+context / `\bsupabase\b`+context. `usesAppleSignIn` does not contain any of those, so 5.0B walls remain closed.

The 5.0F validator's assertions are unaffected by Phase 5.0G (Apple is a new provider, doesn't conflict with `signInWithGoogle`).

## 11. Real iPhone QA matrix

Performed on a real iPhone running an Xcode dev-scheme build. Some rows require a real Apple ID; some require a brand-new Apple ID (one that has never signed into this app/Bundle ID before) to exercise the first-sign-in code/email return path.

| # | Scenario | Expected |
|---|---|---|
| 1 | Cold-launch dev build, signed out → "Continue with Apple" button visible above "Continue with Google" | flag flipped to true locally |
| 2 | Tap "Continue with Apple" → native iOS Apple Sign In sheet appears (NOT a web view); user's Apple ID is pre-filled from iCloud | native, no web prompt |
| 3 | First-time sign-in with a fresh Apple ID, allow real email | App returns signed in; mobile Active Sessions shows iPhone with `This device` pill; profile displayName populated from Apple full name |
| 4 | Sign out, sign in again with the same Apple ID | App returns signed in; Active Sessions still shows ONE row (idempotent device register); displayName + email preserved server-side (Apple does NOT re-send them, but Supabase already has them) |
| 5 | First-time sign-in with a fresh Apple ID, choose "Hide my email" | App returns signed in; the `@privaterelay.appleid.com` address is stored; outgoing emails (recovery codes, etc.) reach the user via Apple's relay |
| 6 | Cancel mid-flow on the Apple sheet | Friendly error "Apple sign-in was cancelled."; signed-out state preserved |
| 7 | Existing email + password sign-in still works | unchanged |
| 8 | Existing email-OTP sign-in still works | unchanged |
| 9 | Existing Google sign-in still works | unchanged — different OAuth client |
| 10 | Recovery flow still works | unchanged |
| 11 | Account already exists with the same email under password sign-in → user signs in via Apple | Supabase merges into the same `auth.users.id` (default behavior); user can subsequently sign in via either method |
| 12 | Devtools / Metro logs during all the above | No `eyJ…` JWT-shaped strings, no `code=…`, no plain access/refresh/identity tokens, no nonce values, no email values |
| 13 | Force-quit + relaunch | Existing session restores via the refresh path; no re-auth required |

## 12. Risks / blockers

1. **Bundle ID change required for App Store.** Current `app.json` has `"bundleIdentifier": "com.anonymous.studio-mobile"` (placeholder). Apple Sign In is keyed on Bundle ID — you can implement and test it under the placeholder for personal dev, but **App Store submission requires a real reverse-DNS bundle (e.g., `app.cockpitpro.studio`)**. Changing the bundle invalidates the existing App ID + provisioning profiles and requires re-doing the Apple Developer steps. Decision: do we change the bundle now (in 5.0G) or defer to a Phase 5.0H "TestFlight readiness" milestone? **Recommendation: defer the bundle change to 5.0H.** Phase 5.0G can use the placeholder bundle for personal-iPhone QA; activation can stay local until the bundle change ships. This keeps 5.0G focused on the auth flow.
2. **Native rebuild required.** `expo-apple-authentication` adds a Pod. After `npx expo install expo-apple-authentication`, you'll need `pod install` + Xcode rebuild — same friction as Phase 5.0E's `expo-crypto` addition.
3. **Apple Developer Program membership required.** Without it, you cannot enable the Sign in with Apple capability or test it on a real device. ($99/year, may already be active given the existing iOS dev build.)
4. **First-sign-in `email`/`fullName` capture.** If we don't persist these on the very first response, they're lost forever (until the user revokes the app from Settings → Apple ID → Sign in with Apple Apps). Implementation must forward them to `complete_onboarding` synchronously after `signInWithIdToken` returns. This is a one-line care item but it's a footgun.
5. **`signInWithIdToken` Supabase support.** Confirm `@supabase/supabase-js@^2.105.1` (already installed) supports `signInWithIdToken({ provider: 'apple', token, nonce })`. Per supabase-js docs, this method has been available since v2.21.0; we're well past that. Low risk.
6. **App Store reviewer rejection on button styling.** Using `AppleAuthentication.AppleAuthenticationButton` from `expo-apple-authentication` mitigates this — it renders the official Apple-styled button.
7. **`expo-apple-authentication` only works on iOS.** Android/Web get a no-op or runtime error. Provider must check `AppleAuthentication.isAvailableAsync()` at button-tap time and surface `identity/apple-not-available` if the device doesn't support it. The flag-gated button itself can also be hidden on non-iOS via `Platform.OS === 'ios'`.

## 13. Deferred work

These are explicitly out of scope for v1 of 5.0G.

- **Account linking UI** — explicit "link Apple to my password account" or "unlink Apple". Supabase merges by email on its own; no explicit UI in v1.
- **Hide-my-email management UI** — surfacing the user's relay email or letting them switch to a real email. Apple owns this UX in iOS Settings → Apple ID. We don't try to replicate it.
- **Android Apple Sign In** — possible via web flow (Option B) but not in 5.0G scope. iOS-only ship.
- **Custom auth domain** — same deferred branding task as 5.0F. Affects the on-screen "to continue to <host>" copy when web flow is used; native flow on iOS doesn't show this at all, so it's a smaller concern after 5.0G ships.
- **Bundle ID change** — see Risks; deferred to Phase 5.0H TestFlight readiness.
- **Sign in with Apple Web JS** for browser/extension surface — different platform, separate phase.
- **Refresh-token rotation specific to Apple** — Supabase handles refresh transparently; no Apple-specific refresh logic needed.

## 14. Recommended implementation phases

| Phase | Subject | Files | Notes |
|---|---|---|---|
| **5.0G-A** | `feat(mobile): add dormant Apple sign-in` | All code files from § 6 + new validator + release-gate wiring + `app.json` capability declaration | Flag stays `false`. Validator passes. Native module installed via `npx expo install expo-apple-authentication`. Pod install + native rebuild required to test locally. |
| **5.0G-B** (external) | — | Apple Developer + Supabase Dashboard setup per § 4 + § 5 | Outside repo. Apple Developer App ID capability + Apple private key (.p8) → Supabase provider config. |
| **5.0G-C** (local) | — | `mobileConfig.ts` flipped locally, never committed | Run iPhone QA matrix from § 11. Add temporary `// TODO(5.0G-qa-debug)` diagnostics if needed (mirroring 5.0F pattern). |
| **5.0G-D** | `chore(mobile): finalize Apple sign-in implementation` | `MobileSupabaseProvider.ts` (diagnostics removed), `account-identity.tsx` (any UI tweaks from QA), new closeout doc `IDENTITY_PHASE_5_0G_APPLE_SIGN_IN_CLOSEOUT.md` | Flag stays `false`. Mirrors 5.0F-cleanup commit. |
| **5.0G-E** | `feat(mobile): activate Apple sign-in (5.0G)` | `mobileConfig.ts` only — one-line flip | Mirrors 5.0F activation commit. |

Total: 3 in-repo commits + 1 external setup step. Estimated implementation effort: ~2–4 hours of focused work for 5.0G-A, plus QA cycle time for 5.0G-B/C.

After 5.0G ships, Phase 5.0H "TestFlight readiness audit" becomes the natural next milestone and can address the Bundle ID change, production env separation, observability hooks, privacy nutrition labels, and provisioning profiles.
