# Phase 5.0E Device Sessions Closeout

## Summary

Phase 5.0E v1 ships end-to-end. Each signed-in surface (mobile + Chrome
extension) registers itself with the Supabase backend, and the user can see
their active sessions on the mobile Account screen. Schema, RPCs, validators,
mobile UI, browser registration, and Supabase deployment have all landed and
been verified on real hardware.

Per-row revoke and "sign out of other devices" remain **deferred** to a future
phase per the original 5.0E spec — see § Deferred work below.

QA was performed on `2026-05-04` against the Supabase project configured by
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the dev build
(project ref `kjwrrkqqtxyxtuigianr`, Cockpit Pro). Mobile testing used a real
iPhone running an Xcode dev-scheme build of the Phase B + Phase B-cleanup
commits. Browser testing used the Chrome extension dev build of the Phase C
commit.

## Commits in this milestone

| SHA | Subject |
|---|---|
| `871172c` | feat(identity): add device sessions schema gate (Phase A) |
| `3a2f6b3` | feat(mobile): add active device sessions (Phase B feature) |
| `2e0e8cf` | chore(mobile): finalize device sessions native lock (Phase B cleanup) |
| `70c1b8c` | feat(extension): register Chrome device sessions (Phase C) |

The unrelated `ea7266a chore(mobile): remove superseded design proposal assets`
sat between Phase B and Phase C in the timeline but is not part of 5.0E.

## What shipped

### Schema + RPCs (Phase A — `871172c`, applied to Supabase)

Migration `supabase/migrations/202605040001_identity_device_sessions.sql`
introduces:

- **Table** `public.device_sessions` with columns `id` (uuid PK), `user_id`
  (FK auth.users on delete cascade), `surface` (text, allow-list constrained),
  `label` (text, length 1..64), `device_token_hash` (text, `^[0-9a-f]{64}$`),
  `created_at`, `last_seen_at`, `revoked_at`. UNIQUE on
  `(user_id, device_token_hash)` for idempotent upserts. Partial index
  `device_sessions_user_active_idx` on `(user_id, last_seen_at desc)
  where revoked_at is null`.
- **Surface allow-list**: `ios_app`, `android_app`, `chrome_extension`,
  `firefox_extension`, `desktop_mac`, `desktop_windows`, `web`. Only the first
  and third are activated in v1; the rest are reserved so future surfaces
  ship without a new schema migration.
- **RLS** enabled with **owner-only** SELECT and UPDATE policies. INSERT and
  DELETE have **no** direct policies — those operations only happen through
  the SECURITY DEFINER RPCs below.
- **Three SECURITY DEFINER RPCs** (`set search_path = public`, scoped via
  `auth.uid()`):
  - `register_device_session(p_surface text, p_label text, p_device_token_hash text)` —
    idempotent upsert. Same `(user_id, device_token_hash)` returns the same
    row id; `last_seen_at` is bumped to `now()` on conflict and `revoked_at`
    is cleared.
  - `touch_device_session(p_device_token_hash text)` — bumps `last_seen_at`
    on the caller's matching row. Returns `null` if the device isn't
    registered.
  - `list_my_device_sessions()` — returns all non-revoked rows for
    `auth.uid()`, ordered by `last_seen_at desc`.
- All three RPCs `revoke all on function … from anon, public; grant execute
  to authenticated;` — never callable from the anon role.
- `revoke_other_device_sessions` is **deliberately not defined** in v1.

### Mobile registration + active-sessions UI (Phase B — `3a2f6b3` + `2e0e8cf`)

- `packages/identity-core/src/contracts.ts`: new types
  `DeviceSessionSurface`, `DeviceSession`, `RegisterDeviceSessionInput`,
  `ListDeviceSessionsResult`; three new methods on the `IdentityProvider`
  interface (`registerDeviceSession`, `touchDeviceSession`,
  `listDeviceSessions`).
- `packages/identity-core/src/mock-provider.ts`: in-memory stubs of the
  three methods for the local-dev provider; cleared on signOut.
- `apps/studio-mobile/src/identity/secureStore.ts`: `readDeviceToken`,
  `writeDeviceToken`, `deleteDeviceToken` keyed at
  `h2o.identity.device.token.v1`. The plaintext device token is generated
  once on first register, persisted to the iOS keychain via
  `expo-secure-store`, never sent to the server, and never logged.
- `apps/studio-mobile/src/identity/MobileSupabaseProvider.ts`: implementation
  of the three provider methods. Token gen via `Crypto.getRandomBytesAsync(32)`
  → 64-char lowercase hex; SHA-256 via
  `Crypto.digestStringAsync(SHA256, value, { encoding: HEX })`. Auto-register
  hooks fire after every successful `signInWithPassword`, `verifyEmailCode`,
  `verifySignupCode`, `setPasswordAfterRecovery`, `refreshSession`. Touch is
  rate-limited to once per 10 minutes. `listDeviceSessions` lazy-registers if
  the in-memory device-session id is missing so the "This device" pill
  resolves correctly on first paint. signOut clears the in-memory id and
  touch timestamp but **keeps** the SecureStore device token so the same row
  is reused on the next sign-in.
- `apps/studio-mobile/src/identity/IdentityContext.tsx`: passthrough exposure
  of the three actions plus an `AppState` foreground listener that calls
  `touchDeviceSession()` on `active`. The provider rate-limit makes the
  foreground touch cheap on rapid backgrounding cycles.
- `apps/studio-mobile/src/app/account-identity.tsx`: ACTIVE SESSIONS card
  under SECURITY. Each row shows surface icon + label + "Last active
  Xm/Xh/Xd ago", with a `This device` pill on the row whose id matches the
  current device. Refresh button re-fetches the list. Empty / errored state
  shows a "Couldn't load active sessions. Tap refresh to retry." banner. No
  revoke button, no sign-out-other-devices button.

The Phase B-cleanup commit removed all temporary `TODO(5.0E-phase-b-debug)`
diagnostic logs added during the WebCrypto root-cause hunt (see § Expo Crypto
native fix below) and committed the iOS `Podfile.lock` update from
`pod install`.

### Chrome extension registration (Phase C — `70c1b8c`)

- `tools/product/identity/identity-provider-supabase.entry.mjs`: new authed
  RPC wrapper `registerDeviceSession(config, accessToken, { surface, label,
  deviceTokenHash })`. Pure SDK call with strict input validation against
  the migration's surface allow-list and the `^[0-9a-f]{64}$` hash format;
  returns only safe public fields on success.
- `tools/product/extension/chrome-live-background.mjs`: device-session helper
  block (`identityDeviceSession_ensureToken`,
  `identityDeviceSession_hashToken`, `identityDeviceSession_deriveLabel`,
  `identityDeviceSession_register`). Token plaintext lives only in
  `chrome.storage.local` under `h2o.identity.device.token.v1`; SHA-256 via
  `crypto.subtle.digest("SHA-256", …)` (Hermes ≠ MV3 service worker — the
  service worker has full WebCrypto, no polyfill needed). Label derived from
  `navigator.userAgentData.platform` (or UA-string fallback) into
  `Mac — Chrome` / `Windows — Chrome` / `Linux — Chrome` / `Browser — Chrome`,
  cached at `h2o.identity.device.label.v1` for stability across launches.
- **Hook point**: `identityProviderSession_publishSafeRuntime`. The function
  is the single converging point for every auth-establishing path (password
  sign-in, OTP verify, signup verify, recovery set-password, refresh, OAuth
  completion). `if (opts.rawSession) void identityDeviceSession_register(opts.rawSession);`
  fires concurrently with cloud-load and snapshot persistence; never blocks
  the auth flow; idempotent server-side via the `(user_id, device_token_hash)`
  UNIQUE upsert.
- No browser UI changes — registration is invisible. The mobile UI's existing
  surface-icon mapping handles `chrome_extension` → globe icon, so Chrome
  appears as a second row labeled `Mac — Chrome` on the iPhone Active
  Sessions card without any mobile code change.

### Expo Crypto native fix (in Phase B feature commit `3a2f6b3`)

Initial Phase B mobile implementation used `globalThis.crypto.subtle.digest`
for SHA-256 hashing. Runtime QA on a real iPhone showed `hasSubtle=false`,
`hasDigest=false`, `hasGetRandomValues=false`, and
`code=identity/webcrypto-unavailable` — the iOS Hermes runtime does not
expose WebCrypto, regardless of the `react-native-get-random-values` polyfill
that `@supabase/supabase-js` pulls in. Root cause confirmed by temporary
on-device flat-string diagnostics; fix shipped:

- `npx expo install expo-crypto` → `expo-crypto@~55.0.14` pinned to Expo SDK 55.
- `MobileSupabaseProvider.ts`: `import * as Crypto from 'expo-crypto'`;
  generate via `Crypto.getRandomBytesAsync(32)`; hash via
  `Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value,
  { encoding: Crypto.CryptoEncoding.HEX })`. Defensive `.toLowerCase()` to
  guarantee 64-char lowercase hex matching the DB CHECK constraint.
- WebCrypto path was removed entirely from the mobile provider — there is no
  fallback because the only environment this provider runs in (iOS / Android
  via React Native) lacks WebCrypto.

The browser path uses native WebCrypto and does NOT use `expo-crypto`. The
two surfaces share only the SHA-256 algorithm and the hex encoding, not the
implementation.

## Supabase deployment verification

Project ref **`kjwrrkqqtxyxtuigianr`** (Cockpit Pro). Verified on the same
session in which Phase A was committed (immediately after `supabase db push`):

| Check | Result |
|---|---|
| `supabase migration list` shows `202605040001` synced Local + Remote + Time | PASS |
| `public.device_sessions` table exists | PASS (visible in `inspect db table-stats`, 3 indexes, 0 rows at deploy time) |
| RPC `public.register_device_session(p_surface text, p_label text, p_device_token_hash text)` | PASS — SECURITY DEFINER |
| RPC `public.touch_device_session(p_device_token_hash text)` | PASS — SECURITY DEFINER |
| RPC `public.list_my_device_sessions()` | PASS — SECURITY DEFINER |
| `revoke_other_device_sessions` does NOT exist | PASS (absent from `pg_proc`) |
| RLS enabled on `public.device_sessions` | PASS (`relrowsecurity=true`) |
| Policy `device_sessions_owner_select` for SELECT exists | PASS |
| Policy `device_sessions_owner_update` for UPDATE exists | PASS |
| No direct INSERT or DELETE policy | PASS |
| EXECUTE grant for each RPC includes `authenticated` | PASS |
| `anon` and `PUBLIC` are NOT in any RPC's grantee list | PASS (only `authenticated`, `postgres`, `service_role` — the latter two are Supabase defaults) |

Verification was performed via `supabase migration list`, `supabase inspect
db table-stats`, and `supabase db query --linked` against the live project.
No secrets were printed during verification.

## Runtime QA matrix

| # | Surface | Scenario | Result |
|---|---|---|---|
| 1 | iPhone | Cold sign-in via Email + Password on dev build, open Account → Active Sessions | PASS — single row labeled `iPhone — Cockpit Pro`, `This device` pill, "Last active Just now" |
| 2 | iPhone | Sign out, sign back in with same account | PASS — list still shows ONE row (idempotent upsert; same `device_token_hash` → same `id`); `Last active` bumped to "Just now" |
| 3 | iPhone | Tap Refresh button | PASS — spinner briefly appears, list re-renders with same data and `This device` pill |
| 4 | iPhone | Background → wait → foreground (within 10 min of last touch) | PASS — `AppState` change handler fires `touchDeviceSession()`, but provider rate-limit no-ops the RPC; `Last active` stays correct |
| 5 | iPhone | Background → wait > 10 min → foreground | PASS — touch RPC fires once, `last_seen_at` bumped server-side |
| 6 | iPhone | Diagnostic confirmed Expo Crypto path: `hasExpoDigest=true hasExpoGetRandomBytes=true`, `register ok hasSession=true hasId=true`, `list result sessionCount=1 hasCurrentSessionId=true` (diagnostic logs since removed in `2e0e8cf`) | PASS |
| 7 | Chrome | Cold sign-in via Email + Password on the Chrome extension dev build | PASS — successful sign-in, no new browser UI |
| 8 | Chrome | DevTools → Application → Storage → Extension → `chrome.storage.local` after step 7 | PASS — keys `h2o.identity.device.token.v1` (64-char hex) and `h2o.identity.device.label.v1` (`Mac — Chrome`) present |
| 9 | iPhone | After step 7, refresh Active Sessions on iPhone | PASS — now shows TWO rows: `iPhone — Cockpit Pro` (with `This device` pill) AND `Mac — Chrome` (no pill, "Last active Just now") |
| 10 | Chrome | Sign out of Chrome extension | PASS — local Chrome auth state cleared; **`h2o.identity.device.token.v1` still present** in `chrome.storage.local` (preserved for idempotent re-register) |
| 11 | Chrome | Sign in to Chrome again with same account | PASS — mobile Active Sessions still shows TWO rows on next refresh, NOT three; the Chrome row's `Last active` updated to "Just now" |
| 12 | iPhone | Profile edit, password change, workspace rename, recovery flow | PASS — all unchanged by 5.0E; ACTIVE SESSIONS card unaffected |
| 13 | Chrome | Account plugin "Session" subtab on Chrome | PASS — 4.4B copy unchanged ("No cross-device sign-out action is implemented", "Manage devices — Deferred") |

The "This device" pill is correct on iPhone because the mobile provider knows
its own `deviceSessionId` from the most recent register response. Chrome does
NOT pin a pill on its own row when listing — except the browser doesn't list
in v1, so this is moot. The pill belongs to whichever surface is rendering
the list (iPhone), which is the right behavior.

## Security and privacy constraints (verified)

- **No raw access tokens, refresh tokens, raw session objects, or raw user
  objects** appear in any committed source under `apps/studio-mobile/src/`,
  `tools/product/identity/`, or `tools/product/extension/`. Verified by 5.0B
  validator (mobile), 4.4 validator (browser runtime sources), and the
  background-bundle / 3.0Q / 3.2B / 3.2C validators (provider entry).
- **No plain device token is ever sent to the server.** Both surfaces
  generate the token, persist it on-device, hash it with SHA-256, and only
  send the 64-char lowercase hex hash. Verified by 5.0E validator's positive
  presence + chrome.storage.local assertions, and by the migration's
  `device_token_hash ~ '^[0-9a-f]{64}$'` CHECK constraint.
- **SHA-256 hash only; the server has no inverse.** Even with a full table
  dump, the server cannot recover any plain device token.
- **Browser**: device token lives in `chrome.storage.local` only. Validators
  forbid `chrome.storage.sync` and `chrome.storage.session` references in
  the device-session block (would replicate the token to other Chrome
  profiles, creating phantom rows / cross-profile leakage).
- **Mobile**: device token lives in the iOS keychain via `expo-secure-store`
  only. AsyncStorage is forbidden for the device token by the existing 5.0B
  ownership rule (`expo-secure-store` import is restricted to
  `secureStore.ts`).
- **No IP, no geolocation, no full user-agent, no device fingerprint** is
  stored. Mobile label is hardcoded (`iPhone — Cockpit Pro`); browser label
  is a coarse platform tag (`Mac` / `Windows` / `Linux` / `Browser`) plus
  the literal `Chrome`. The migration's column set has no IP, geo, or UA
  fields.
- **No console logging of plain tokens, full hashes, access tokens, refresh
  tokens, raw sessions, raw users, emails, or passwords.** Enforced by the
  5.0E client-bundle anti-leak guard and the 5.0D recovery anti-log guard.

## Validators / gates

| Validator | Result | Notes |
|---|---|---|
| `validate-identity-phase5_0e-device-sessions.mjs` | PASS | Schema + RPC asserts (Phase A); client-bundle anti-leak (Phase B + Phase C); positive-presence + chrome.storage.local-only checks (Phase C) |
| `validate-identity-phase4_4-session-management.mjs` | PASS | Walls intact. The line-115 `device_sessions` literal block was relaxed during Phase A to exclude only the 5.0E migration file; the runtime walls (browser registration / OAuth / sign-out scope / device-management bridge actions) remain closed and were never weakened |
| `validate-identity-phase5_0d-recovery.mjs` | PASS | Recovery posture unchanged |
| `validate-identity-phase5_0b-mobile-alignment.mjs` | PASS | Mobile alignment unchanged; `expo-crypto` added as direct dep was within the spec |
| `validate-identity-background-bundle.mjs` | PASS | `helperOrder` array + `*Index` declaration + `rpcMatches.length === 7` extended to register the new approved RPC |
| `validate-identity-phase3_0q.mjs` | PASS | Same mechanical extension as background-bundle |
| `validate-identity-phase3_2b-schema.mjs` | PASS | `rpcMatches.length === 7` + new per-RPC-name uniqueness check |
| `validate-identity-phase3_2c-rls-live.mjs` | PASS | Same as 3.2B |
| `validate-identity-phase3_8e-password-integrity.mjs` | PASS | Count 6 → 7 + presence check for `register_device_session` |
| `validate-identity-phase4_0b-account-security-mvp.mjs` | PASS | Count 6 → 7 only |
| `run-identity-release-gate.mjs` | PASS | Full release gate green at `70c1b8c` HEAD |
| `apps/studio-mobile && npx tsc --noEmit` | PASS | Mobile types clean across all phases |

The validator updates **only register the new approved RPC**. Every
existing assertion was preserved; no count-without-name relaxations; no
arbitrary-RPC allowances; no removal of forbid-list entries.

## Deferred work

These are **explicitly out of scope** for v1 per the original 5.0E spec.
None block production use of v1.

- **Sign out of all other devices (`revoke_other_device_sessions`)** —
  deferred until the Supabase `signOut({ scope: 'others' })` behavior is
  verified end-to-end on real hardware against the live project. The 5.0E
  validator currently asserts the function does NOT exist in the migration.
- **Per-row revoke** — would let the user explicitly revoke a specific
  device session from the mobile UI. Likely needs a service-role Edge
  Function (or a careful security-definer RPC with extra checks) and its
  own spec/closeout cycle.
- **Browser-side device list UI** — a "Manage devices" panel inside the
  Chrome extension Account plugin. Phase 4.4B copy currently says "Manage
  devices — Deferred" and stays deferred; the mobile Active Sessions card
  is the authoritative listing surface in v1.
- **Firefox / desktop / web surface registrations** — the migration's
  `surface` allow-list reserves `firefox_extension`, `desktop_mac`,
  `desktop_windows`, `web` slugs, but no surface code has been wired to
  register itself. Each new surface activation is its own future phase.
- **Richer device labels** — v1 uses coarse `iPhone — Cockpit Pro` /
  `Mac — Chrome` labels. User-customizable nicknames, more granular
  platform detection (model name, OS version), and disambiguation between
  multiple browsers / browser profiles on the same machine are all
  deferred.
- **Server-side cleanup of stale rows** — the table grows monotonically
  unless rows are revoked. A periodic cleanup job (or a simple
  `last_seen_at < now() - interval '6 months'` retention policy) is left
  for a future phase.

## Current state

- **Device sessions v1 is live** end-to-end against project
  `kjwrrkqqtxyxtuigianr`.
- iPhone shows itself with `This device` pill; Chrome shows up as
  `Mac — Chrome`.
- All 4 Phase 5.0E commits (`871172c`, `3a2f6b3`, `2e0e8cf`, `70c1b8c`)
  are local on `main`.
- Working tree is clean.
- **No push performed.** Local `main` is 40 commits ahead of `origin/main`.
