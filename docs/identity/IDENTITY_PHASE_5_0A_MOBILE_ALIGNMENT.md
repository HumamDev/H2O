# Identity Phase 5.0A — Mobile Identity Alignment

> **Status:** Approved architecture review. Design-only phase. **No code changes are made under this phase.** Implementation is gated to Phase 5.0B.

## 1. Context and inputs

**Why this exists.** The H2O / Cockpit Pro browser-extension identity stack passed its Identity 4.9 release-candidate gate. The next strategic move is bringing the Expo iOS app at `apps/studio-mobile` into alignment with that contract so mobile and browser share one identity model and one Supabase backend. This phase is design-only: it locks decisions, it does not write production code.

**Inputs treated as authoritative:**

| Input | Path / reference | Role |
|---|---|---|
| Identity 4.9 RC contract | Verified by release-gate green run, narrow manifests, runtime checks (B / G / H / J / K / L / M / N / O) clean | The contract mobile aligns to |
| Pure contract package | `packages/identity-core/` (TypeScript, zero deps, zero browser assumptions) | Cross-platform contract source of truth |
| Phase 2.8 §13 sketch | `docs/identity/IDENTITY_PHASE_2_8_ARCHITECTURE.md` | Prior mobile-alignment design baseline (formalized here against 4.9 reality) |
| Phase 4.7B production gate | `tools/validation/identity/validate-identity-phase4_7-production-deployment-gate.mjs` | Production manifest contract |
| Phase 4.8B redaction policy | `tools/validation/identity/validate-identity-phase4_8-observability-support-diagnostics.mjs` | Diagnostics / no-leak contract |
| Mobile app current state | `apps/studio-mobile/` (Expo SDK 55, RN 0.83, expo-router, no identity surface) | Greenfield target |

**Operating constraints:**
1. Browser identity contract is the stable source of truth; 5.0A does not modify it.
2. No browser identity flow is redesigned during 5.0A.
3. Any browser contract gap surfaced becomes a 4.x amendment, not a 5.0A patch.
4. Mock-fallback invariant is carried forward to mobile explicitly.
5. Microsoft / GitHub / Apple OAuth and the OAuth registry remain deferred.
6. Public snapshot shape stays byte-stable; platform/runtime metadata goes elsewhere (see D6).

## 2. Scope and deferrals

**In scope (5.0A produces):**
- This document.
- Locked architectural decisions D1–D11.
- Cross-platform contract reference table.
- Mobile token-custody model.
- Mobile boot sequence.
- Per-flow A–O browser-to-mobile mapping.
- Diagnostics / redaction parity contract.
- Mobile Supabase config policy.
- 4.x-amendment list.
- 5.0B implementation prerequisites.
- Mobile validator design (intent + asserts list, not source).
- Recovery-flow verification plan and checklist (Appendix B).
- Go/no-go criteria from 5.0A to 5.0B.

**Explicitly deferred (NOT part of 5.0A):**
- Implementing any mobile identity code.
- Adding npm dependencies to `apps/studio-mobile`.
- Touching `packages/identity-core` source files.
- Touching browser scripts (`scripts/0D4a.*.js` etc.).
- Writing `packages/identity-core/README.md` (proposed text appears as Appendix A here).
- Microsoft / GitHub / Apple OAuth.
- OAuth provider-registry refactor.
- Google OAuth refactor on browser.
- Google OAuth implementation on mobile (deferred to 5.0C, after 5.0B).
- Supabase schema or RLS changes (mobile reuses existing tables).
- Sign-out-everywhere, manage-devices, export-delete-account-deletion features.
- Billing on mobile.
- EAS / TestFlight / App Store distribution setup.
- Mobile WebDAV plaintext-credential hardening (4.x amendment).

## 3. Architectural decisions D1–D11

### D1 — Canonical contract package

`packages/identity-core` is the cross-platform identity contract source of truth. Mobile imports `IdentitySnapshot`, `IdentityProvider`, state-machine helpers, masking helpers, and profile/workspace types directly. No mobile-specific contract types are introduced. Browser-extension consumption of `identity-core` (it currently re-implements the contract in `scripts/0D4a.*.js`) is **not part of 5.0A** — recorded as **Amendment 4.X.A1** in §10.

### D2 — Token custody on mobile

| Material | Storage | Key | Lifetime | Forbidden alternative |
|---|---|---|---|---|
| Refresh token | `expo-secure-store` (iOS Keychain, Android Keystore) | `h2o.identity.provider.refresh.v1` | Persistent until sign-out / rotation / explicit clear | AsyncStorage, `expo-file-system`, RN state, UserDefaults / SharedPreferences |
| Access token | In-memory only, held by the root identity provider (React context) | n/a | Single app process; recomputed on every restart from refresh token | Any persistent storage |
| Session metadata (expiry, masked email, masked user id) | AsyncStorage | `h2o.identity.session-meta.v1` | Mirrors current snapshot lifecycle | Token-shaped fields are forbidden in this object |
| Snapshot | AsyncStorage | `h2o.identity.snapshot.v1` | Mirrors browser `h2o:prm:cgx:identity:v1:snapshot` | n/a |
| Audit trail (last 8 entries, emails masked) | AsyncStorage | `h2o.identity.audit.v1` | Mirrors browser `h2o:prm:cgx:identity:v1:audit` | n/a |
| Mock state | In-memory only | n/a | Not persisted (see D5) | Any persistence mechanism |

**Invariant.** No code path on the page/UI/screen tier reads from SecureStore. SecureStore reads/writes happen only inside `MobileSupabaseProvider` and a thin secure-store wrapper. `selfCheck()` enforces a `noTokenSurface` invariant on every snapshot serialization, identical to browser.

### D3 — Auth flows on mobile (declared here, implemented in 5.0B)

Mobile uses `@supabase/supabase-js` directly inside a single `MobileSupabaseProvider` class implementing `IdentityProvider` from `identity-core`. No bridge, no IPC, no service worker — Supabase calls go directly from the provider class.

| Flow | Supabase API (proposed) | State transitions | Notes |
|---|---|---|---|
| Sign-up | `signUp({ email, password })` | `anonymous_local → email_confirmation_pending` | Resends covered by `resend({ type:'signup', email })` |
| Confirm signup | `verifyOtp({ email, token, type:'signup' })` | `email_confirmation_pending → verified_no_profile` | Profile/workspace creation follows |
| Password sign-in | `signInWithPassword({ email, password })` | `anonymous_local → sync_ready` | Wrong password emits safe `identity/invalid-credentials` |
| Email-code sign-in (existing user) | `signInWithOtp({ email, options:{ shouldCreateUser:false } })` then `verifyOtp({ type:'email' })` | `anonymous_local → email_pending → sync_ready` | `shouldCreateUser:false` mirrors Phase 4.5 invariant |
| Recovery request | **see verification note below** | `anonymous_local → recovery_code_pending` | Browser contract is OTP-code, not link |
| Recovery verify | **see verification note below** | `recovery_code_pending → password_update_required` | Marker persists across app restarts |
| Set password (recovery) | `updateUser({ password })` | `password_update_required → sync_ready` | Old password rejected after this |
| Signed-in change password | `updateUser({ password })` (with current-password reverify) | `sync_ready → sync_ready` | Wrong current emits safe error, fields cleared |
| Sign-out | `signOut({ scope:'local' })` | `* → anonymous_local` | SecureStore + AsyncStorage cleanup; mock fallback resumes |
| Restart restore | `setSession({ refresh_token })` from SecureStore | `anonymous_local (idle) → sync_ready` if refresh ok | If refresh fails, discard the SecureStore key and stay mock |

**Recovery-flow verification required before 5.0B implementation.** The browser contract is OTP-code-based recovery: `recovery_code_pending → user enters 6-digit code → password_update_required → mandatory set-password → sync_ready`. Supabase v2 SDK's `resetPasswordForEmail()` is configured at the project level — depending on the project's email-template settings, it can issue either a recovery **link** (the common default) or an OTP **code**. **5.0B work must not begin its recovery implementation until both of these are verified:**

1. The pinned `@supabase/supabase-js` version in mobile supports an OTP-code path for password recovery.
2. The target Supabase project's "Reset Password" email template is configured to issue an OTP code, not a link.

**If verification fails** (Supabase or project is link-only in this configuration), the correct response is **explicit escalation**: open a 4.x or 5.0B design amendment with one of three options — (a) reconfigure the Supabase project's email template to OTP, (b) change the cross-platform contract to allow link-based recovery on mobile while browser keeps OTP, (c) change both platforms to link-based recovery. Each option has follow-on consequences (universal-link wiring, deep-link return, set-password screen entry path) that need explicit approval. **Do not silently substitute link-for-code.**

**Verification ownership (locked).** Claude Code owns the verification plan and checklist (see Appendix B). The repo owner runs the actual email/OTP inbox test step manually because it requires inbox access. The verification result gates 5.0B recovery implementation.

### D4 — Google OAuth on mobile (deferred to 5.0C)

When 5.0C ships, the design is:
- `expo-auth-session` with PKCE, no implicit flow.
- Custom URL scheme `studiomobile://auth/callback` registered in `app.json` and Info.plist.
- Provider token / provider refresh token never leave the OAuth handler closure — same invariant as browser Phase 3.9C.
- `chrome.identity` has no equivalent on mobile; no `launchWebAuthFlow`. The session that comes back from Supabase OAuth is treated identically to the password sign-in session.
- **First-cut mobile identity (5.0B) ships password + email-code only. No OAuth.** Microsoft / GitHub / Apple remain deferred indefinitely.

### D5 — Mock-fallback semantics

Mobile mirrors the browser invariant exactly:
- Idle state: `mode: local_dev / provider: mock_local`.
- Provider mode is asserted **only** by an active live session OR a successful SecureStore refresh-token read at boot.
- **No persisted mock state on mobile.** There is deliberately no `h2oIdentityMockSnapshotV1`-equivalent. This avoids the stale-mock-anchor failure mode hit during the Identity 4.9 RC pass.
- Sign-out drops back to mock idle. Restart-after-sign-out stays mock.

### D6 — Cross-platform parity (snapshot stays stable; runtime metadata in diag)

**Public snapshot shape is unchanged.** No `platform` field. No `runtimeKind` field. No new keys. Browser snapshot from 4.9 and mobile snapshot are byte-identical in shape.

**Platform / runtime metadata lives in `diag().runtime`** — a new sub-object inside the existing diagnostics output:

```
diag().runtime = {
  platform: 'browser-extension' | 'studio-mobile',
  runtimeKind: 'chrome-mv3' | 'expo-ios' | 'expo-android',
  appVersion: string,            // app/package.json version
  identityCoreVersion: string    // packages/identity-core version
}
```

**Implementation gating.** `diag().runtime` is **not implementable until Amendment 4.X.A3 lands**. Phase 4.8 redaction validator currently accepts only the existing diag schema; introducing a new sub-object — even one containing only string scalars — is a schema extension that needs explicit allow-list approval. **5.0B must not ship `diag().runtime` until A3 is approved and merged.** A3 is scheduled as a small standalone amendment before 5.0B implementation starts (see §10 and §11). If A3 is rejected or delayed, fallback options for 5.0B are: (i) defer runtime metadata exposure entirely (mobile validator infers platform from package context), (ii) propose a different home (e.g., a separate `H2O.Identity.runtimeInfo()` accessor) under a new amendment.

**`selfCheck()` invariant unchanged.** `noTokenSurface` continues to apply to the snapshot. `diag().runtime` is plain-string metadata and does not introduce token-shaped fields.

### D7 — Independent device sessions

Browser session and mobile session are fully independent. No session sharing. No cross-device push. No SSO. A user signing in on mobile does not affect their browser session; signing out on browser does not log mobile out. (Sign-out-everywhere remains deferred — see §2.)

### D8 — Boot ordering on mobile

Strict gated boot. Library / chat / settings screens do **not** mount until identity boot resolves to a public state.

```
t=0     Mount root identity provider in idle / mock state.
t=0+    Mount lightweight splash with a "Restoring session…" indicator.
t≈50ms  SecureStore.getItemAsync('h2o.identity.provider.refresh.v1')
        ├─ resolve(null)  → status=anonymous_local, transition to auth screens
        ├─ resolve(token) → MobileSupabaseProvider.setSession({refresh_token})
        │                     ├─ success → status=sync_ready, hydrate snapshot, render library
        │                     └─ failure → SecureStore.deleteItemAsync, transition to auth screens
        └─ reject (keychain locked / device locked)
                          → status=anonymous_local with retry banner, transition to auth screens

t ≤ BOOT_RESTORE_TIMEOUT_MS  (default 4000ms; configurable build-time constant; recommended 3000–5000ms)
        While restore is pending, KEEP the splash visible with the "Restoring session…"
        indicator. DO NOT flip to a signed-out screen at the timeout — this is the
        no-flicker guarantee.

t > BOOT_RESTORE_TIMEOUT_MS  (graceful escape)
        Splash continues in the background, restore continues. Splash adds a
        "Sign in instead" affordance the user can tap to bail out manually
        and proceed to the auth screens. Background restore that later succeeds
        seamlessly transitions to sync_ready and dismisses the splash.
```

**Why no false sign-out flicker.** Slow networks, locked-keychain biometric prompts (FaceID / TouchID), and cold SecureStore reads can each push restore beyond a sub-second budget. Flipping to a signed-out screen at 1.5s and then back to `sync_ready` at 4s is materially worse UX than holding a clear "Restoring session…" indicator. The 5.0B implementation must instrument restore latency and report (via `diag().runtime` once A3 lands, or via local logging) so the default timeout can be tuned with real data.

**Configurability.** `BOOT_RESTORE_TIMEOUT_MS` is a build-time constant in `mobileConfig.ts` (see D11). 5.0B includes this constant in the validator's expected-shape check.

### D9 — Capability contract on mobile

Mobile `MobileSupabaseProvider.capabilities` returns:

```
{
  emailMagicLink: false,
  emailOtp: true,
  profileRead: true,
  profileWrite: true,
  persistentSession: true,
  cloudSync: false
}
```

`cloudSync: false` matches browser today. When cloud-sync work happens later, it flips on both platforms in the same release.

### D10 — Diagnostics on mobile

`H2O.Identity.diag()` and `H2O.Identity.selfCheck()` ship on mobile from day one of 5.0B with the same contract as Phase 4.8B:
- `diag()` returns masked email, masked profile email, capabilities, audit trail (last 8 entries, emails masked), `lastError` with `detail` stripped.
- `diag().runtime` (D6) is added **only after Amendment 4.X.A3 lands**. Until then, mobile `diag()` ships with the existing 4.8 schema, identical to browser.
- `selfCheck()` enforces `noTokenSurface` against the snapshot JSON.
- A new mobile-side validator runs in CI (see §9).

### D11 — Mobile Supabase config policy

Mobile config is **public client config only.**

**Allowed in mobile bundle / source / config:**
- `SUPABASE_URL` (project URL) — public; the same identifier appears in browser dev manifest's `optional_host_permissions`.
- `SUPABASE_ANON_KEY` (publishable anon key) — public; designed for client embedding, RLS-gated server-side.

**Forbidden in mobile bundle, source, config, env files, build artifacts, and CI variables intended for mobile:**
- `SUPABASE_SERVICE_ROLE_KEY` — never. This key bypasses RLS and is server-only. Service-role operations must happen in a privileged backend, never from a mobile app.
- OAuth client secrets — never (any provider, deferred or otherwise).
- Webhook secrets, signing keys, private keys — never.
- Any secret that is not designed to be embedded in a public client.

**Config injection rules:**
- A single `mobileConfig.ts` module is the only place reading `process.env.*`, Expo's `Constants.expoConfig.extra`, or EAS build-time substitution variables. All other modules import named constants from `mobileConfig.ts`.
- Per-environment configs are documented: `dev`, `staging`, `prod`. Each environment binds its own `SUPABASE_URL` + `SUPABASE_ANON_KEY` pair. **No environment uses production keys at dev time.**
- No literal `https://*.supabase.co` URL or anon-key string appears outside `mobileConfig.ts`. Asserted by validator.
- Config rotation procedure (when an anon key rotates) is documented as part of mobile distribution work — out of identity scope but referenced from this spec.

**Project-selection policy (locked).**
- **Development:** browser and mobile share the **same** dev Supabase project. Lower friction during 5.0B; a single project to manage RLS, email templates, and `auth.users` rows for both clients.
- **Production:** before mobile public launch, a **fresh production Supabase project** is provisioned, isolated from the browser dev project. Browser production also moves to (or already lives at) a separate production project. Cross-cutting decisions (email-template configuration, RLS, OAuth providers when added) are landed on the production project before launch.

**Local development.** Developers obtain dev `SUPABASE_URL` + `SUPABASE_ANON_KEY` from the same source as browser dev (today: `identity-provider.local.json` for browser; equivalent ignored-from-VCS file for mobile, name TBD in 5.0B). Service-role-key fields, if accidentally added to that file, are explicitly ignored / refused by `mobileConfig.ts` even at dev time.

## 4. Browser contract source-of-truth reference

Lifted verbatim from Identity 4.9 — these are the alignment targets, not new decisions.

### 4.1 Public snapshot shape (mobile must match exactly)

```
{
  version: string,               // identity-core version
  status: IdentityPublicState,   // see §4.2
  mode: 'local_dev' | 'provider_backed',
  provider: 'mock_local' | 'supabase' | 'firebase' | 'clerk' | 'custom',
  pendingEmail: string | null,   // masked or null; never raw
  emailVerified: boolean,
  profile: H2OProfile | null,
  workspace: H2OWorkspace | null,
  credentialState: 'complete' | 'required' | 'unknown',
  credentialProvider: 'password' | 'google' | 'multiple' | 'unknown',
  onboardingCompleted: boolean,
  lastError: { code, message, detail?, at } | null,
  updatedAt: ISO8601
}
```

### 4.2 Public states

`anonymous_local | email_pending | email_confirmation_pending | recovery_code_pending | password_reset_email_sent | password_update_required | verified_no_profile | profile_ready | sync_ready | auth_error`

### 4.3 Storage-key custody

| Key | Browser owner | Mobile owner | Notes |
|---|---|---|---|
| `h2oIdentityProviderSessionV1` | bg `chrome.storage.session` (fallback `local`) | n/a — mobile uses in-memory access token | Browser-only |
| `h2oIdentityProviderPersistentRefreshV1` | bg `chrome.storage.local` | replaced by `h2o.identity.provider.refresh.v1` in SecureStore | Refresh-token custody |
| `h2oIdentityProviderPasswordUpdateRequiredV1` | bg `chrome.storage.local` | AsyncStorage `h2o.identity.password-update-required.v1` | Recovery marker |
| `h2oIdentityProviderOAuthFlowV1` | bg `chrome.storage.local` | n/a until 5.0C (OAuth deferred) | OAuth transient |
| `h2o:prm:cgx:identity:v1:snapshot` | page `localStorage` | AsyncStorage `h2o.identity.snapshot.v1` | UI-tier snapshot cache |
| `h2o:prm:cgx:identity:v1:audit` | page `localStorage` | AsyncStorage `h2o.identity.audit.v1` | Audit trail |
| `h2oIdentityMockSnapshotV1` | bg `chrome.storage.local` (deprecated; subject of Amendment 4.X.A5) | **deliberately absent on mobile** | Mock state in-memory only |

### 4.4 Error-code contract (carried verbatim)

`identity/invalid-email`, `identity/invalid-credentials`, `identity/invalid-transition`, `identity/missing-email`, `identity/missing-code`, `identity/email-not-confirmed`, `identity/otp-expired`, `identity/resend-cooldown`, `identity/refresh-failed`, `identity/network-unavailable`, `identity/rate-limited`, `identity/provider-signup-failed`, plus existing 3.8 / 4.5 codes. Mobile maps Supabase errors into this taxonomy via the same sanitizer pattern as Phase 4.8.

## 5. Mobile token-custody model (formal)

Single `secureStore` wrapper module exposes only:

```
async readRefreshToken(): Promise<string | null>
async writeRefreshToken(token: string): Promise<void>
async deleteRefreshToken(): Promise<void>
```

No other module reads or writes SecureStore directly. Access tokens never enter this module. The wrapper logs nothing about the token (length, prefix, age) — only success/failure flags.

`MobileSupabaseProvider` holds the access token in a private field. `getSnapshot()` does not include it. `diag()` does not include it. `selfCheck()` fails fast if a JSON-stringify of the snapshot contains the substring `"token"`.

A separate single `mobileStorage` wrapper module is the only module calling `AsyncStorage.setItem` / `setItemAsync`. It exports a `sanitizeForPersistence(value)` helper that strips any object key matching the redaction regex (Phase 4.8 contract) before write. Belt-and-suspenders defense in depth even if a future bug tries to persist a token-shaped field.

## 6. Mobile boot sequence (canonical)

Already given in D8. The implementation contract for 5.0B:
- Splash screen with "Restoring session…" indicator mounts at t=0.
- Boot promise resolves by t≤`BOOT_RESTORE_TIMEOUT_MS` (default 4000ms) or earlier on success/explicit failure.
- Library / settings / chat screens are mounted only after the boot promise resolves to one of: `anonymous_local`, `sync_ready`, or any other public state.
- If the boot resolves to `password_update_required` (recovery in progress, app restarted before set-password), the set-password screen is the only screen mounted.
- After the timeout, splash stays visible with restore continuing in the background, plus a "Sign in instead" affordance the user can tap to bail out.

## 7. Flow mapping A–O (browser → mobile)

| Flow | Browser surface | Mobile surface (5.0B) | Notes |
|---|---|---|---|
| **A** Account creation + email confirmation | identity HTML surface, OTP entry | RN screen with email/password + OTP entry | Same Supabase project, same `auth.users` row |
| **B** Password sign-in | identity HTML surface | RN sign-in screen | Wrong password offers recovery (D / mobile) |
| **C** Existing-user email-code | identity HTML surface | RN existing-user OTP screen | `shouldCreateUser:false` enforced (Phase 4.5 invariant) |
| **D** Wrong-password recovery → set-password | identity HTML surface, multi-step | RN multi-step screen with persisted `password_update_required` marker | **Subject to D3 verification (Appendix B) — recovery flow may need amendment** |
| **E** Signed-in password change | Account → Identity → Security | Account screen → Security section | Wrong current emits safe error, fields cleared |
| **F** Google OAuth | Account → Identity → Sign-in Methods + popup | **Deferred to 5.0C.** First-cut 5.0B has no OAuth button | When 5.0C ships, uses `expo-auth-session` PKCE |
| **G** Persistent restart restore | bg refresh-token + restore on boot | SecureStore refresh-token + restore on app boot, gated splash (D8) | Identical invariant: no token visible to UI tier |
| **H** Sign-out cleanup | bg storage cleanup contract | SecureStore + AsyncStorage cleanup | After mobile sign-out, every alignment-tracked storage key is empty/absent |
| **I** Profile/workspace edits | Account → Identity → Profile | Account screen → Profile section | Same validation rules (display-name regex, avatar token regex, workspace-name length) |
| **J** Connected credentials display | Sign-in Methods section | Account screen → Sign-in Methods section | Same inert/deferred buttons; no add-password / unlink / MS / GH / Apple |
| **K** Account-tab internal sections | Overview / Profile / Sign-in Methods / Security / Session / Privacy & Data / Testing | Same seven sections in mobile Account screen | Section taxonomy is part of the contract |
| **L** Session / current-browser | Session subtab, This Browser controls | Session section on mobile, **"This device"** copy | Sign-out-everywhere / Manage devices remain inert |
| **M** Privacy & Data | Privacy & Data subtab | Same | Export / delete / account-deletion remain inert |
| **N** Diagnostics safety | `diag()` masked-only, `selfCheck()` `noTokenSurface` | Same — plus `diag().runtime` after A3 lands | Mobile validator enforces |
| **O** Billing separation | Account → Billing & Subscription tab | **Deferred** — billing is not on mobile in 5.0B | Verify identity is not perturbed by any future billing wiring |

## 8. Diagnostics / redaction parity

Both platforms must satisfy:

```
∀ snapshot: !JSON.stringify(snapshot).match(/token|secret|^password$|refresh|credential/i)
∀ diag():
   diag().email is masked or absent
   diag().profile.email is masked or absent
   diag().lastError.detail is absent
   diag().audit[].email is masked or absent
   diag().runtime  (post-A3 only)
       exists with platform, runtimeKind, appVersion, identityCoreVersion (strings only)
       no other fields contain token-shaped data
∀ selfCheck():
   returns { ok: boolean, violations: string[] }
   violations is empty when noTokenSurface holds
```

Mobile implementation note: any audit-trail entry written from a Supabase error response runs through the same sanitizer as browser. Sharing the sanitizer via `packages/identity-core` is recorded as Amendment 4.X.A4; until that lands, mobile carries its own copy with identical logic and a TODO pointing at the amendment.

## 9. Mobile validator design

Path (when 5.0B ships, not 5.0A): `tools/validation/identity/validate-identity-phase5_0b-mobile-alignment.mjs`

**Asserts (5.0A specifies, 5.0B implements):**

1. `apps/studio-mobile/package.json` declares `@h2o/identity-core` as a dependency.
2. `apps/studio-mobile/package.json` declares `expo-secure-store` and `@supabase/supabase-js` as dependencies.
3. No mobile source file under `apps/studio-mobile/` matches `chrome\.|window\.|localStorage|sessionStorage` (browser-only escape hatches).
4. The single `secureStore` wrapper module is the only module under `apps/studio-mobile/` importing from `expo-secure-store`. Asserted by source scan: every other file's import list excludes `expo-secure-store`.
5. The single `mobileStorage` wrapper module is the only module calling `AsyncStorage.setItem` / `setItemAsync`. Asserted by source scan: every other file's AsyncStorage usage is read-only or absent.
6. The `mobileStorage` wrapper module exports a `sanitizeForPersistence()` helper and applies it to every value before write. Asserted by parsing the wrapper module's source: every `setItem` call site is preceded by `sanitizeForPersistence` invocation in the same function scope.
7. **Object-shape ban (not source-text ban):** `getSnapshot()` and `diag()` source code does not return any object literal whose **key** matches the redaction regex `/access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawEmail|providerIdentity|identity_data|currentPassword|current_password|newPassword|confirmPassword|owner_user_id|deleted_at|^password$/i`. **Source-text occurrences of the substrings "password" or "refresh" are explicitly NOT banned** — those appear legitimately in state names (`password_update_required`, `recovery_code_pending`), error codes (`identity/refresh-failed`), and UI copy ("Reset your password", "Refresh identity").
8. `signInWithOtp({ shouldCreateUser:false })` appears in the existing-user OTP code path (Phase 4.5 invariant).
9. SecureStore key matches the canonical name `h2o.identity.provider.refresh.v1`.
10. Capability object literal returns `{ emailMagicLink: false, emailOtp: true, profileRead: true, profileWrite: true, persistentSession: true, cloudSync: false }` in the mobile provider.
11. `app.json` does **not** declare any custom URL scheme for OAuth callback yet (asserts that 5.0B does not silently enable 5.0C OAuth).
12. No mobile source file imports from `chrome.identity` (impossible on mobile but asserted defensively).
13. **Runtime `selfCheck()` smoke harness:** a small Node-side harness mounts the mobile identity module against a fake `sync_ready` snapshot fixture and asserts `selfCheck()` returns `{ ok: true, violations: [] }`. (No real provider call. No network.)
14. **Config-policy assert (D11):** `https://*.supabase.co` URL literals and anon-key-shaped strings (long base64 / JWT) appear only inside `mobileConfig.ts`. Hard-coded URLs or keys elsewhere in mobile source fail the validator. The service-role-key-shape (specifically the JWT `role: "service_role"` claim, or any string explicitly named `*service_role*` / `*serviceRole*`) is rejected anywhere in mobile source, env files committed to repo, or `app.json`.
15. **Boot-config assert:** `mobileConfig.ts` exports `BOOT_RESTORE_TIMEOUT_MS` as a numeric constant in the recommended range `[3000, 5000]`. Value outside this range fails fast (signals untested configuration).
16. **Recovery-flow gate:** if mobile source contains a recovery-flow implementation, the validator asserts that a `RECOVERY_FLOW_VERIFIED` flag is set in `mobileConfig.ts` (or equivalent), proving the D3 verification (Appendix B) was completed before the implementation was merged. If the flag is false / absent, the validator fails. (This is a soft gate against accidentally shipping a silent link-for-code substitution.)

**Integration:** Validator is added to `tools/validation/identity/run-identity-release-gate.mjs` as a sibling of the existing 4.x validators. Release gate continues to fail-fast on any non-zero exit.

## 10. 4.x amendment list

Per the operating constraint: surfaced gaps become amendments, not 5.0A patches.

| ID | Amendment | Triage |
|---|---|---|
| **4.X.A1** | Browser scripts (`scripts/0D4a.*.js` etc.) consume `packages/identity-core` instead of mirroring its concepts in parallel | **Follow-up phase** — 4.x.1 refactor; not 5.0A blocking; high impact for long-term maintenance |
| **4.X.A2** | Mobile WebDAV credential plaintext storage (`expo-file-system` JSON file `h2o_webdav_settings_v1.json`) | **Schedule** as a separate mobile-credential-hygiene amendment; orthogonal to identity 5.0A but in the same neighborhood; should land before any mobile public release |
| **4.X.A3** | Phase 4.8 redaction validator allows `diag().runtime` sub-object containing only string scalars | **Schedule as a small standalone amendment before 5.0B implementation starts.** Required for 5.0B's D6 / D10. Minor schema extension; one-line allow-list change. Not folded into a large 5.0B opening commit. Without A3, 5.0B ships diag without `.runtime` (see D6 fallback). |
| **4.X.A4** | Move the audit-entry sanitizer into `packages/identity-core` as a shared export | **Follow-up phase** — bundled with A1 (it makes A1 cleaner); not 5.0A blocking |
| **4.X.A5** | Remove `h2oIdentityMockSnapshotV1` from browser bg (deprecated; was the source of the 4.9 RC mock-pollution blocker) | **Recommended before public mobile release**, not a 5.0B prereq. Mobile's mock-state-in-memory-only design (D5) does not depend on browser-side cleanup; 5.0B can proceed with A5 still pending. Bundle A5 with the pre-release hardening sweep. |
| **4.X.A6** | `apps/studio-mobile` bundle ID change from `com.anonymous.studio-mobile` to a real reverse-DNS identifier | **Won't-do under identity scope** — distribution concern; tracked under mobile distribution work |

Each scheduled amendment becomes its own small phase plan; none of them block 5.0A approval.

## 11. 5.0B implementation prerequisites

Before 5.0B work begins, the following must be true:

1. This 5.0A spec is approved and committed to `docs/identity/`.
2. **Amendment 4.X.A3 is landed as a small standalone amendment** (required for D6 `diag().runtime` and D10's diag-shape parity). If A3 is rejected/delayed, 5.0B ships diag without `.runtime` per D6's fallback, and the validator's runtime-metadata assert is conditionally skipped.
3. **D3 recovery-flow verification is complete** (Appendix B checklist filled): the pinned `@supabase/supabase-js` version + the target Supabase project's "Reset Password" email template are confirmed to issue an OTP code (not a link). If verification fails, an explicit amendment is opened before any recovery code is written.
4. **Supabase project decision (locked):** dev work uses the same Supabase project as browser dev. Production launch uses a fresh production Supabase project, isolated from dev. Production project provisioning is part of the pre-launch work, not a 5.0B blocker for development.
5. SDK selection recorded: `@supabase/supabase-js` v2.x (the same major as browser bundle). Pin a specific minor version in 5.0B opening work.
6. The 5.0B implementation phase has its own plan file with its own decisions, builds, and validators.

**Not a prereq (recommended-but-not-blocking):**
- Amendment 4.X.A5 (deprecate `h2oIdentityMockSnapshotV1` on browser). Recommended to land before public mobile release; not required to start 5.0B implementation.

## 12. Go / no-go criteria — 5.0A → 5.0B

5.0A is complete and 5.0B may begin if and only if:

- [ ] This document exists at `docs/identity/IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md` and the repo owner has approved it.
- [ ] Decisions D1–D11 are locked with no open `TBD` markers.
- [ ] The browser contract reference table (§4) matches Identity 4.9 byte-for-byte (no contract drift introduced under 5.0A).
- [ ] The 4.x amendment list is triaged: every entry has a triage label of **schedule**, **schedule as a small standalone amendment before 5.0B**, **follow-up phase**, **recommended before public mobile release**, or **won't-do**.
- [ ] The flow mapping table (§7) covers A–O with no `?` cells. The D3 recovery-flow verification note is acknowledged in flow D's row.
- [ ] The mobile validator design (§9) lists at least the 16 asserts above, including the recovery-flow gate (assert 16) and the config-policy asserts (14, 15).
- [ ] No mobile code exists under `apps/studio-mobile/` related to identity, auth, or session yet (5.0A is design-only).
- [ ] The deferred-feature surface (§2) mirrors 4.9's exactly, plus mobile-specific deferrals (Google OAuth → 5.0C, MS/GH/Apple → indefinite).
- [ ] The mock-fallback invariant (D5) is explicitly carried forward.
- [ ] The mobile Supabase config policy (D11) is explicit about service-role-key prohibition and the dev-shared / prod-fresh project decision.
- [ ] Recovery-flow verification ownership is explicit: Claude Code owns plan + checklist (Appendix B); repo owner runs the inbox test step.
- [ ] The disposable-account QA roadmap follow-up from 4.9 is acknowledged as still pending and is not consumed by 5.0A.

If any checkbox cannot be ticked, 5.0A stays open and 5.0B does not begin.

---

## Appendix A — Proposed `packages/identity-core/README.md` content (draft only; not written this phase)

This is **draft content** to be written under a future phase, not written now. Included here so the spec is the single home for cross-platform identity-core orientation.

````markdown
# @h2o/identity-core

Pure contracts, state machine, and mock provider for the H2O Cockpit Pro identity stack. Zero runtime dependencies. No browser, no Node, no React Native assumptions.

## Status

`0.1.0` — frozen contract surface as of Identity 4.9 RC. Cross-platform alignment with `apps/studio-mobile` is specified in `docs/identity/IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md`.

## Consumers

- **Browser extension** — `scripts/0D4a.⬛️🔐 Identity Core 🔐.js` mirrors the contract today; planned to consume this package directly under Amendment 4.X.A1.
- **Mobile (Expo iOS / Android)** — `apps/studio-mobile/` consumes this package as part of Phase 5.0B.

## What this package exports

- `IdentitySnapshot`, `IdentityPublicState`, `IdentityMode`, `IdentityProviderKind`
- `IdentityProvider` interface (the port mobile/browser implement against their backend)
- State-machine helpers: `canTransitionIdentity`, `transitionIdentity`, `createInitialIdentitySnapshot`, `isIdentityPublicState`
- Profile/workspace types: `H2OProfile`, `H2OWorkspace`, `ProfilePatch`
- Validation helpers: `assertValidEmail`, `isValidEmail`, `normalizeEmail`, `sanitizeProfilePatch`
- Masking helpers: `maskEmail`
- Profile-creation helpers: `normalizeDisplayName`, `normalizeWorkspaceName`, `pickAvatarColor`, `createLocalProfileAndWorkspace`
- ID helpers: `makeIdentityId`, `nowIso`
- `MockLocalIdentityProvider` — reference implementation; do not ship to production
- `MOCK_LOCAL_CAPABILITIES`

## What this package deliberately does not do

- HTTP / fetch / Supabase / Firebase calls
- Storage (no `localStorage`, no `chrome.storage`, no AsyncStorage, no SecureStore)
- DOM / `window` / `chrome.*` references
- Logging / telemetry
- React, RN, Expo, or Node-only APIs

The caller (browser extension or mobile app) provides storage, transport, and platform glue.

## Versioning

Contract changes go through a phase plan in `docs/identity/`. The `version` field of `IdentitySnapshot` matches `package.json`'s version. Bump rules:

- patch: documentation / non-functional refactor
- minor: new optional fields or new helpers (no removal, no rename)
- major: any breaking change to public types or semantics

Identity 4.9 froze `0.1.0`. Phase 5.0B may bump to `0.2.0` if mobile alignment requires any minor additions.
````

---

## Appendix B — Recovery-flow verification plan and checklist

**Purpose.** Verify that the pinned Supabase SDK + target Supabase project's email-template configuration deliver an OTP code (not a recovery link) for password reset, so that the cross-platform recovery contract from Identity 4.9 (`recovery_code_pending → user enters 6-digit code → password_update_required → set-password → sync_ready`) holds on mobile.

**Ownership.** Claude Code owns the plan, the checklist, and the result-recording document shape. The repo owner runs step 4 (the actual inbox test) because it requires manual inbox access and a real Supabase email send.

**Outcome gate.** A passing checklist is a 5.0B prerequisite for any code that touches the recovery flow. If the checklist fails, an explicit amendment must be opened before 5.0B recovery implementation begins.

### Verification checklist

For each item, record one of: **PASS**, **FAIL**, **N/A** (with a one-line note). Capture the result in the 5.0B opening commit's verification ledger.

1. **SDK version pinned.** `apps/studio-mobile/package.json` (when 5.0B starts) declares `@supabase/supabase-js` at a specific `^2.x.y` minor. Record the exact version string. Owner: Claude Code (review during 5.0B kickoff).
2. **SDK source supports OTP recovery.** Read the pinned SDK's `auth/GoTrueAdminApi`/`GoTrueClient` source for `resetPasswordForEmail` and `verifyOtp` to confirm `type: 'recovery'` is supported and that the response shape (on `verifyOtp`) returns a usable session for `updateUser({ password })`. Owner: Claude Code.
3. **Target project email template inspected.** Open the dev Supabase project's Auth → Email Templates → "Reset Password". Confirm the template body contains the `{{ .Token }}` (or equivalent OTP-code) placeholder rather than a `{{ .ConfirmationURL }}` link-only template. If the template is link-only, this step is a FAIL. Owner: repo owner (project dashboard access required).
4. **Live recovery email test.** Trigger `resetPasswordForEmail({ email: <test address> })` against the dev project (test address can be a disposable address; do not use the live `h.obayda@gmail.com` account). Inspect the inbox content. Expected: a 6-digit OTP code in the email body. If only a link is present, this step is a FAIL. Owner: repo owner (inbox access required).
5. **OTP verifies and reaches `password_update_required`.** Using a small one-off harness (or the mobile dev build once 5.0B starts), call `verifyOtp({ email, token, type: 'recovery' })` with the code from step 4. Expected: the call returns a session, and the resulting state machine transitions to `password_update_required`. Owner: Claude Code drafts the harness; repo owner runs it if the harness needs network access on a real device.
6. **`updateUser({ password })` clears the marker.** From the `password_update_required` state, call `updateUser({ password: <new strong password> })`. Expected: success, state transitions to `sync_ready`, `password_update_required` marker is cleared. Owner: Claude Code (validator coverage) + repo owner (one-time live confirmation).
7. **Old password rejected after recovery.** Sign out. Sign in with the **old** password. Expected: safe failure (`identity/invalid-credentials`). Sign in with the **new** password. Expected: success. Owner: repo owner (manual sign-in test).
8. **Verification ledger committed.** The 5.0B opening commit (or a small companion commit) records the per-step results with the date and SDK/project versions. The validator's `RECOVERY_FLOW_VERIFIED` flag (assert 16 in §9) is flipped to `true` only when steps 1–7 are all PASS.

### If any step fails

Stop. Do not write recovery-flow code in 5.0B. Open one of the three amendment options listed in D3:
- (a) Reconfigure the Supabase project's email template to OTP — usually the cheapest path. Re-run the checklist.
- (b) Cross-platform contract change: allow link-based recovery on mobile while browser keeps OTP. Requires universal-link wiring + deep-link return + a different set-password screen entry path.
- (c) Cross-platform contract change: both platforms move to link-based recovery. Largest blast radius; requires browser RC re-validation.

Each option lands as its own amendment with its own approval before 5.0B recovery implementation resumes.
