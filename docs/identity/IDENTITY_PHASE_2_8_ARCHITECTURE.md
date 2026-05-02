# Identity Phase 2.8 Architecture Freeze

**Auth Provider · Session Boundary · Callback Strategy · Cloud Profile Schema**

| Field | Value |
|---|---|
| Phase | 2.8B / 2.8C |
| Status | **Architecture Freeze — Documentation Only** |
| Date | 2026-04-27 |
| Preceding phases | 1, 2, 2.5, 2.6, 2.7A, 2.7B, 2.7C |
| Next coding phase | 2.9 (Adapter Skeleton — mock-backed, no real auth) |

---

## Table of Contents

1. [Decision Summary](#1-decision-summary)
2. [Scope and Non-Goals](#2-scope-and-non-goals)
3. [Current H2O Identity Architecture](#3-current-h2o-identity-architecture)
4. [Final Provider and Callback Decision](#4-final-provider-and-callback-decision)
5. [Token and Session Boundary](#5-token-and-session-boundary)
6. [Extension Background Auth Module Responsibilities](#6-extension-background-auth-module-responsibilities)
7. [Identity Bridge Command Contract](#7-identity-bridge-command-contract)
8. [Public H2O.Identity Derived Snapshot Shape](#8-public-h2oidentity-derived-snapshot-shape)
9. [Onboarding Page Real-Auth Flow](#9-onboarding-page-real-auth-flow)
10. [MVP Supabase Schema](#10-mvp-supabase-schema)
11. [RLS Policy Requirements](#11-rls-policy-requirements)
12. [Local/Mock to Cloud Migration](#12-localmock-to-cloud-migration)
13. [Mobile Alignment](#13-mobile-alignment)
14. [Phase 2.9 Adapter Skeleton Requirements](#14-phase-29-adapter-skeleton-requirements)
15. [Phase 3 Implementation Sequence](#15-phase-3-implementation-sequence)
16. [Do-Not-Do Rules](#16-do-not-do-rules)
17. [Open Questions Before Phase 2.9](#17-open-questions-before-phase-29)
18. [Pre-Phase-2.9 Notes (Code Inspection Findings)](#18-pre-phase-29-notes-code-inspection-findings)
19. [Validation Checklist](#19-validation-checklist)
20. [Official References](#20-official-references)

---

## 1. Decision Summary

### Frozen Decisions

| Decision | Accepted Value |
|---|---|
| **Provider** | Supabase Auth |
| **MVP login method** | Email OTP code (6-digit, user enters in onboarding page) |
| **Magic link** | Deferred — Phase 3.5 after production domain exists |
| **OAuth / social** | Deferred — Phase 3.5, use `chrome.identity.launchWebAuthFlow` |
| **Password auth** | Not in MVP |
| **Token owner** | Extension background / service worker exclusively |
| **Active session state** | Background memory and/or `chrome.storage.session` |
| **Persisted refresh material** | `chrome.storage.local` only, behind a background auth module |
| **Mobile token storage** | iOS Keychain / `expo-secure-store` |
| **Public identity state** | Derived snapshot only — no tokens, no raw session objects |
| **`chrome.identity.launchWebAuthFlow`** | Not for OTP; reserved for future OAuth provider redirects |
| **`chrome-extension://` as email callback URI** | Not a valid primary strategy |
| **Local / dev mode** | Preserved permanently as a named mode |

### Why This Combination

Email OTP code flow requires **no redirect URI** of any kind. The full flow is API calls from the extension background to Supabase. No browser redirect, no `chrome-extension://` URL, no hosted relay page, no Offscreen Document. This is the minimum viable real auth path for a Chrome extension.

Supabase is the only candidate that simultaneously offers email OTP, PostgreSQL for profile/workspace data with row-level security, and a self-hosting exit path. Firebase does not support email OTP. Clerk explicitly blocks OAuth redirects in Chrome extensions and has no self-hosting path.

---

## 2. Scope and Non-Goals

### This document is:

- An architecture and contract specification for Phase 2.9 and Phase 3.
- The authoritative record of frozen Phase 2.8 decisions.
- The source of truth for Phase 2.9 implementors (human or Codex).

### This document is NOT:

- A runtime implementation. No code is shipped.
- A Supabase project setup. No keys or credentials exist.
- A database migration. No tables are created.
- A provider SDK integration. No `supabase-js` is imported.
- A start of Phase 2.9 or Phase 3 work.
- A change to any runtime script, config file, or dev-order.

---

## 3. Current H2O Identity Architecture

### Ownership Map (Current — Phase 2.7C)

| Component | File | Role | Auth Owner? |
|---|---|---|---|
| **H2O.Identity** | `scripts/0D4a.⬛️🔐 Identity Core 🔐.js` | Identity state facade; owns state machine, localStorage persistence, bridge sync | **Yes — source of truth for identity state** |
| **H2O.IdentityFirstRunPrompt** | `scripts/0D4b.⚫️🔐 Identity First-Run Prompt 🚪🔐.js` | Soft first-run prompt UI; reads H2O.Identity snapshot only | No — consumer only |
| **Control Hub Account tab** | `scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js` | Displays identity status and provides action buttons | No — consumer only |
| **Ops Panel** | `tools/dev-controls/ops-panel/make-chrome-ops-panel-extension.mjs` | Dev/testing trigger for first-run prompt | No — testing entry only |
| **Extension background** | `tools/product/extension/chrome-live-background.mjs` | Bridge relay: stores/retrieves mock snapshot in `chrome.storage.local`; opens onboarding window | Partial — stores mock snapshot at background request |
| **Loader / content script** | `tools/product/extension/chrome-live-loader.mjs` | Relays `h2o-ext-identity:v1:req/res` messages between page and background | No — relay only |
| **Onboarding page** | `surfaces/identity/identity.html` | Product-owned H2O / Cockpit Pro account/profile surface | No — UI surface only |

### Current Bridge Protocol (Phase 2.6 / existing)

The content script relays messages between the ChatGPT page and the extension background:

| Message type constant | Value | Direction |
|---|---|---|
| `BRIDGE_MSG_SW` | `'h2o-ext-identity:v1'` | Background receives |
| `BRIDGE_MSG_REQ` | `'h2o-ext-identity:v1:req'` | Page → content script (postMessage relay) |
| `BRIDGE_MSG_RES` | `'h2o-ext-identity:v1:res'` | Content script → page (postMessage relay) |

Current background-handled actions:

| Action | What it does |
|---|---|
| `identity:get-snapshot` | Returns mock snapshot from `chrome.storage.local["h2oIdentityMockSnapshotV1"]` |
| `identity:set-snapshot` | Writes sanitized mock snapshot to `chrome.storage.local["h2oIdentityMockSnapshotV1"]` |
| `identity:clear-snapshot` | Removes mock snapshot from `chrome.storage.local` |
| `identity:get-onboarding-url` | Returns `chrome.runtime.getURL('surfaces/identity/identity.html')` |
| `identity:open-onboarding` | Opens onboarding popup via `chrome.windows.create` |

### Current Storage Layout

| Storage location | Key | Content | Owner |
|---|---|---|---|
| Page `localStorage` | `h2o:prm:cgx:identity:v1:snapshot` | Derived mock snapshot (no tokens) | H2O.Identity |
| Page `localStorage` | `h2o:prm:cgx:identity:v1:audit` | Audit trail (last 30 events) | H2O.Identity |
| `chrome.storage.local` | `h2oIdentityMockSnapshotV1` | Sanitized mock snapshot (cross-context sync) | Extension background |

### Current State Machine

```
ANONYMOUS_LOCAL ──► EMAIL_PENDING ──► VERIFIED_NO_PROFILE ──► PROFILE_READY ──► SYNC_READY
       ▲                  │                    │                      │               │
       │                  └──────────────┐     └──────────────┐      └───────────┐   │
       │                                 ▼                     ▼                  ▼   ▼
       └─────────────────────────── AUTH_ERROR ◄──────────────────────────────────────┘
```

Allowed transitions are defined in `ALLOWED_TRANSITIONS` inside `0D4a`. This structure is preserved unchanged in Phase 3.

### What must remain true in Phase 3

- `H2O.Identity` remains the sole identity state facade consumed by all page scripts and surfaces.
- `H2O.IdentityFirstRunPrompt` owns only the floating prompt UI.
- Control Hub Account tab and Ops Panel remain consumers and testing entry points only.
- The onboarding page remains a product-owned H2O / Cockpit Pro surface, not a ChatGPT/OpenAI surface.
- No page script, content script, or H2O.Identity public API may ever hold or return provider tokens.

---

## 4. Final Provider and Callback Decision

### Why Supabase

| Criterion | Supabase | Firebase | Clerk |
|---|---|---|---|
| **Email OTP (code, not magic link)** | ✅ Native | ❌ Phone SMS only | ✅ Native |
| **Chrome extension — official guide** | ⚠️ No dedicated guide | ✅ Offscreen Document pattern | ✅ With major limitations |
| **OAuth redirect in extension** | ⚠️ Untested | ⚠️ Requires Offscreen Doc | ❌ Explicitly blocked |
| **OTP code — no redirect needed** | ✅ API-only, no redirect | N/A | ✅ API-only |
| **Self-hosting portability** | ✅ Docker Compose | ❌ Managed only | ❌ Managed only |
| **PostgreSQL + RLS for app data** | ✅ Same DB | ❌ Firestore separate | ❌ External DB needed |
| **Open source core** | ✅ | ❌ | ❌ |
| **Mobile deep links / PKCE** | ✅ Documented | ✅ | ⚠️ Limited docs |
| **Vendor lock-in** | Low | High | Medium-High |
| **Free tier** | MAU-based | 50K MAU | 50K MRU |
| **Anonymous → real user migration** | Not documented | ✅ `linkWithCredential()` | Not documented |

Supabase is chosen because it is the only candidate that satisfies all three primary constraints simultaneously: email OTP support, self-hosting portability, and a unified PostgreSQL backend for identity and application data.

Firebase's lack of email OTP and absence of a self-hosting path are disqualifying. Clerk's explicit blocking of OAuth redirects in Chrome extensions and lack of self-hosting are disqualifying.

### Why Email OTP First

OTP code flow has zero redirect URI complexity. The complete flow is:

```
[Onboarding page] → bridge → [Background] → Supabase signInWithOtp() → email sent
[User opens email, copies 6-digit code]
[Onboarding page enters code] → bridge → [Background] → Supabase verifyOtp() → session returned
[Background stores session] → bridge → [H2O.Identity updated with derived state]
```

No URL redirect. No `chrome-extension://` URI in any provider config. No browser popup. No Offscreen Document. No hosted web page. This is achievable entirely with `supabase-js` running inside the extension background service worker.

Reference: [Supabase email OTP / passwordless](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp) · [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)

### Why Magic Links Are Deferred

Magic link emails contain a URL that the user clicks. That URL redirects to a `redirect_to` URI configured in Supabase. Chrome extensions cannot reliably receive HTTP redirects as primary callbacks:

- `chrome-extension://` URIs are not reliably opened by email clients clicking links.
- A hosted web page relay (`https://cockpitpro.app/auth/callback`) would be required to catch the redirect and message the extension via `externally_connectable`.
- Email security scanners that preload links for threat detection consume the one-time token before the user clicks, making magic links silently fail.

Magic links become viable in Phase 3.5 after a production domain is registered and `externally_connectable` is configured. They are not a regression from OTP — they are an additive convenience later.

### Why OAuth Is Deferred

OAuth providers (Google, GitHub, etc.) require a browser redirect to the provider and back. In a Chrome extension, this requires `chrome.identity.launchWebAuthFlow`, which opens a Chrome-managed browser window, handles the redirect to `https://<extension-id>.chromiumapp.org`, and returns the auth code. This is the correct mechanism but requires additional configuration (extension ID in authorized domains, OAuth app setup per provider). It is out of scope for MVP.

`chrome.identity.launchWebAuthFlow` is the correct tool for future OAuth flows. It is explicitly reserved for that use. Reference: [Chrome identity API](https://developer.chrome.com/docs/extensions/reference/api/identity).

### Why `chrome.identity.launchWebAuthFlow` Is Not Used for OTP

`launchWebAuthFlow` is an OAuth browser redirect handler. OTP is a direct API call — no browser redirect at any point. These are unrelated mechanisms. Using `launchWebAuthFlow` for OTP would be incorrect.

---

## 5. Token and Session Boundary

### Hard Rules — Non-Negotiable

These rules apply to every line of Phase 2.9 and Phase 3 implementation:

**Rule 1 — No tokens in page scripts.**
Page scripts (including all H2O scripts running on chatgpt.com) must never receive, hold, or log provider access tokens, refresh tokens, or raw session objects. This applies to H2O.Identity, H2O.IdentityFirstRunPrompt, Control Hub, and all MiniMap/Highlights/Pagination scripts.

**Rule 2 — No tokens in H2O.Identity public snapshot.**
`H2O.Identity.getSnapshot()` returns a derived state object. It must never include `access_token`, `refresh_token`, `id_token`, `provider_token`, `auth_code`, or any raw session field. The existing `noTokenSurface` check in `selfCheck()` enforces this; it must be preserved.

**Rule 3 — No tokens in ChatGPT page localStorage.**
Page `localStorage` at `chatgpt.com` is accessible to any script running on the page. No provider credential material may be written there. The current code writes only a sanitized derived snapshot — this behavior must be preserved in Phase 3.

**Rule 4 — No tokens in Control Hub or Ops Panel.**
The Control Hub Account tab reads `H2O.Identity.diag()` and `H2O.Identity.getSnapshot()`. These must continue to return only derived state. The Ops Panel triggers actions via bridge messages — it must not receive session material in responses.

**Rule 5 — Extension background / service worker owns the provider session.**
The extension background is the sole context where the Supabase client is initialized and the sole context where access and refresh tokens exist at runtime.

**Rule 6 — Active session state: background memory and/or `chrome.storage.session`.**
During an active browser session, the access token and related runtime session state should live in background module memory, or in `chrome.storage.session` (which clears on browser restart and extension reload). The existing `storageSessionArea()` function in the background already provides this: it uses `chrome.storage.session` when available, with `chrome.storage.local` as a fallback.

Reference: [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)

**Rule 7 — Persisted refresh material: `chrome.storage.local` only, behind a background auth module.**
If the refresh token must survive browser restarts (for "stay signed in" behavior), it may be written to `chrome.storage.local` only through the `AuthSessionManager` module inside the extension background. No other code may write to or read from that key. The key must not be exposed through any bridge response.

**Rule 8 — Mobile uses Keychain / SecureStore.**
On iOS/Android, provider tokens live in the device secure enclave. In Expo/React Native: `expo-secure-store`. In Swift/UIKit: `KeychainServices`. `UserDefaults`, `AsyncStorage`, and plain file storage are forbidden for token material.

Reference: [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)

**Rule 9 — Bridge responses must never include token material.**
All bridge responses from the background to page scripts must pass through a sanitization step equivalent to the existing `sanitizeForBridge()` (strips any key matching `/token|secret|password|refresh/i`). This filter applies to every new identity bridge command added in Phase 2.9 and Phase 3.

**Rule 10 — Logs must redact emails and token-like strings.**
`diag()`, audit trails, and any `console.warn` / `console.log` touching auth state must redact email addresses (using the existing `maskEmail()` pattern: first + last char of local part + `***@domain`) and must never log token strings. This applies from Phase 2.9 forward.

### Storage Location Summary

| Context | Access token | Refresh token | Derived snapshot | Reason |
|---|---|---|---|---|
| Background memory | ✅ During active session | ❌ Do not persist in memory only | N/A | Cleared on SW termination — fine for access token |
| `chrome.storage.session` | ✅ Preferred for active session | ⚠️ Optional (cleared on restart) | N/A | Session-lifetime; not accessible from page scripts |
| `chrome.storage.local` | ❌ Not preferred | ✅ If persistence needed, behind auth module | ✅ Derived snapshot OK | Persists across restarts; extension-context only |
| `chrome.storage.sync` | ❌ Never | ❌ Never | ❌ Never | Replicates across Chrome profiles — wrong scope |
| Page `localStorage` | ❌ Never | ❌ Never | ✅ Derived snapshot only | Accessible to page scripts; tokens must never appear |
| Content script memory | ❌ Never | ❌ Never | ❌ Never | Content scripts are untrusted relay pipes |
| H2O.Identity snapshot (`window`) | ❌ Never | ❌ Never | ✅ Derived fields only | Any page script can read this |
| iOS Keychain / SecureStore | N/A | ✅ Mobile only | N/A | Correct mobile secure storage |

---

## 6. Extension Background Auth Module Responsibilities

### Module Name: `AuthSessionManager` (or `IdentityProviderRuntime`)

This is a new module added to the extension background in Phase 2.9 (mock-backed) and wired to Supabase in Phase 3.0. It is the sole owner of provider session state within the extension.

### Responsibilities

1. **Initialize the Supabase client** (Phase 3.0). Hold the client instance in module scope, not exposed outside the module.

2. **Handle OTP request.** Receive `identity:request-email-otp` from the bridge, call `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`, return derived `{ ok, emailMasked }` — no token material.

3. **Handle OTP verification.** Receive `identity:verify-email-otp` from the bridge, call `supabase.auth.verifyOtp({ email, token, type: 'email' })`, receive the session, store it, return derived `{ ok, status: 'verified_no_profile' }`.

4. **Store session securely.** Write access token to `chrome.storage.session` (active session scope). Write refresh token to `chrome.storage.local` only if persistence is required. Use a dedicated storage key prefix, separate from the existing mock snapshot key. The existing mock key `"h2oIdentityMockSnapshotV1"` is not used by this module.

5. **Refresh session.** Receive `identity:refresh-session` from the bridge, call `supabase.auth.refreshSession()` if the access token is near expiry, update stored tokens, publish updated derived state. Also callable by `chrome.alarms` for proactive refresh (Phase 3.2).

6. **Rehydrate after MV3 service worker wake.** On every service worker startup, read stored session from `chrome.storage.session` (or `chrome.storage.local` if persisted). Call `supabase.auth.setSession({ access_token, refresh_token })`. If the access token is expired, call `refreshSession()`. Publish derived state to bridge. Reference: [Chrome MV3 service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers).

7. **Sign out.** Receive `identity:sign-out`, call `supabase.auth.signOut()`, clear stored session from `chrome.storage.session` and `chrome.storage.local`, publish `{ status: 'anonymous_local' }` derived state.

8. **Create cloud profile.** Receive `identity:create-profile`, write a row to the `profiles` table in Supabase, return derived profile summary (no tokens).

9. **Create / attach workspace.** Receive `identity:create-workspace` or `identity:attach-local-profile`, write rows to `workspaces` and `workspace_memberships`, return derived workspace summary.

10. **Publish derived identity state.** After any state change, construct the derived snapshot (Section 8) and push it through the identity bridge so H2O.Identity can update all consumers. The push path is: `AuthSessionManager` → bridge message to content script → content script relays to page → H2O.Identity updates its snapshot and fires `h2o:identity:changed`.

11. **Own provider errors and redact them.** Errors returned through the bridge must never include raw error messages that contain token strings, email addresses, or provider-internal codes. Sanitize before returning.

12. **Never expose raw session or tokens through any bridge response.** Every bridge response from `AuthSessionManager` must pass through sanitization before being sent.

### What `AuthSessionManager` does NOT do

- It does not own the `H2O.Identity` state machine. The page-side `H2O.Identity` still owns the state machine and event emission — it just sources its state from bridge messages rather than local-only mock operations.
- It does not open the onboarding window. That remains `identity:open-onboarding` as before.
- It does not own the first-run prompt. That remains `H2O.IdentityFirstRunPrompt`.

---

## 7. Identity Bridge Command Contract

### Context

The bridge protocol uses existing message type constants:
- Background receives: `{ type: 'h2o-ext-identity:v1', req: { action, ...payload } }`
- Page relay (postMessage): `{ type: 'h2o-ext-identity:v1:req', id, req: { action, ...payload } }`
- Page relay response: `{ type: 'h2o-ext-identity:v1:res', id, ok, ...fields }`

Existing actions (`identity:get-snapshot`, `identity:set-snapshot`, `identity:clear-snapshot`, `identity:get-onboarding-url`, `identity:open-onboarding`) are preserved unchanged.

New actions added in Phase 2.9 (mock-backed) and wired in Phase 3:

---

### `identity:request-email-otp`

| Field | Value |
|---|---|
| **Caller** | Onboarding page (via bridge) |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | `{ email: string }` — email address only |
| **Returned derived output** | `{ ok: boolean, emailMasked: string, nextStatus: 'email_pending' }` |
| **Forbidden output** | Any token, any OTP token hash, raw Supabase response object |
| **Phase 2.9 behavior** | Returns mock `{ ok: true, emailMasked: 'u***@example.com', nextStatus: 'email_pending' }` |
| **Phase 3.1 behavior** | Calls `supabase.auth.signInWithOtp({ email })`, returns derived ok/error |

---

### `identity:verify-email-otp`

| Field | Value |
|---|---|
| **Caller** | Onboarding page (via bridge) |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | `{ email: string, code: string }` — email + 6-digit user-entered code |
| **Returned derived output** | `{ ok: boolean, nextStatus: 'verified_no_profile' \| 'auth_error', errorCode?: string }` |
| **Forbidden output** | `access_token`, `refresh_token`, `id_token`, `session` object, raw Supabase response |
| **Phase 2.9 behavior** | Returns mock `{ ok: true, nextStatus: 'verified_no_profile' }` for any non-empty code |
| **Phase 3.1 behavior** | Calls `supabase.auth.verifyOtp({ email, token: code, type: 'email' })`, stores session internally, returns derived status |

---

### `identity:get-derived-state`

| Field | Value |
|---|---|
| **Caller** | H2O.Identity (on bridge hydration), onboarding page, Control Hub |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | None |
| **Returned derived output** | Full derived snapshot object (see Section 8) |
| **Forbidden output** | Any token field, raw session, internal Supabase user object |
| **Notes** | Replaces `identity:get-snapshot` as the canonical state read in Phase 3. The mock `identity:get-snapshot` remains for backward compatibility during Phase 2.9 transition |

---

### `identity:refresh-session`

| Field | Value |
|---|---|
| **Caller** | H2O.Identity (on page visibility change), `chrome.alarms` handler (Phase 3.2) |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | None |
| **Returned derived output** | `{ ok: boolean, updatedAt: string }` |
| **Forbidden output** | Any token, new session object |
| **Phase 2.9 behavior** | Returns `{ ok: true, updatedAt: <now> }` (mock no-op) |
| **Phase 3.2 behavior** | Calls `supabase.auth.refreshSession()`, updates stored tokens, returns derived result |

---

### `identity:sign-out`

| Field | Value |
|---|---|
| **Caller** | Control Hub Account tab action, onboarding page |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | None |
| **Returned derived output** | `{ ok: boolean, nextStatus: 'anonymous_local' }` |
| **Forbidden output** | Any token |
| **Phase 2.9 behavior** | Clears mock state, returns `{ ok: true, nextStatus: 'anonymous_local' }` |
| **Phase 3.2 behavior** | Calls `supabase.auth.signOut()`, clears stored session, returns derived result |

---

### `identity:create-profile`

| Field | Value |
|---|---|
| **Caller** | Onboarding page (after OTP verified, no profile yet) |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | `{ displayName: string, avatarColor?: string }` |
| **Returned derived output** | `{ ok: boolean, nextStatus: 'profile_ready', profile: { id, displayName, avatarColor, createdAt } }` |
| **Forbidden output** | Any token, raw Supabase user object, internal user ID in plain form if avoidable |
| **Phase 2.9 behavior** | Returns mock profile matching input |
| **Phase 3.4 behavior** | Writes row to Supabase `profiles` table, returns derived profile summary |

---

### `identity:create-workspace`

| Field | Value |
|---|---|
| **Caller** | Onboarding page (after profile created) |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | `{ name?: string }` |
| **Returned derived output** | `{ ok: boolean, nextStatus: 'sync_ready', workspace: { id, name, createdAt } }` |
| **Forbidden output** | Any token |
| **Phase 2.9 behavior** | Returns mock workspace |
| **Phase 3.4 behavior** | Writes rows to `workspaces` and `workspace_memberships`, returns derived workspace summary |

---

### `identity:attach-local-profile`

| Field | Value |
|---|---|
| **Caller** | Onboarding page (user chooses to copy existing local profile to cloud) |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | `{ localProfileId: string, displayName?: string, localWorkspaceId?: string }` |
| **Returned derived output** | `{ ok: boolean, migrated: boolean, nextStatus: 'profile_ready' }` |
| **Forbidden output** | Any token |
| **Notes** | Explicit user-confirmed migration path. Not automatic. |

---

### `identity:migrate-local-workspace`

| Field | Value |
|---|---|
| **Caller** | Onboarding page (user confirms workspace migration) |
| **Owner** | Extension background / `AuthSessionManager` |
| **Allowed input** | `{ localWorkspaceId: string, name?: string }` |
| **Returned derived output** | `{ ok: boolean, migrated: boolean, nextStatus: 'sync_ready' }` |
| **Forbidden output** | Any token |
| **Notes** | Writes `local_workspace_id` + `migrated_at` to the cloud workspace row. |

---

## 8. Public H2O.Identity Derived Snapshot Shape

This is the shape of the object returned by `H2O.Identity.getSnapshot()` in Phase 3. It is also the shape produced by `identity:get-derived-state`.

### Safe Fields (Allowed)

```
{
  version:              string,           // e.g. "0.1.0"
  status:               string,           // one of the STATES enum values
  mode:                 string,           // "local_dev" | "provider_backed"
  provider:             string,           // "mock_local" | "supabase"
  providerKind:         string,           // "none" | "supabase" (normalized for consumers)
  emailVerified:        boolean,
  emailMasked:          string | null,    // e.g. "u***@example.com" — never raw email
  onboardingCompleted:  boolean,
  syncReady:            boolean,          // true when status === 'sync_ready'
  profile: {
    id:           string,                 // opaque identifier, not raw DB UUID
    displayName:  string,
    avatarColor:  string,
    createdAt:    string,                 // ISO 8601
    updatedAt:    string
  } | null,
  workspace: {
    id:           string,
    name:         string,
    role:         string,                 // "owner" | "member"
    createdAt:    string,
    updatedAt:    string
  } | null,
  capabilities: {
    emailOtp:           boolean,
    emailMagicLink:     boolean,
    profileRead:        boolean,
    profileWrite:       boolean,
    persistentSession:  boolean,
    cloudSync:          boolean
  },
  lastError: {
    code:     string,
    message:  string                      // sanitized; must not contain tokens or raw email
  } | null,
  updatedAt:  string                      // ISO 8601
}
```

### Explicitly Forbidden Fields

The following fields must **never** appear in the snapshot, any bridge response, or any `diag()` output:

- `access_token`
- `refresh_token`
- `id_token`
- `provider_token`
- `provider_refresh_token`
- `auth_code`
- `otp_token_hash`
- `token_hash`
- `session` (raw Supabase session object)
- `user` (raw Supabase user object)
- Raw email address (only `emailMasked` is permitted)

The existing `selfCheck()` `noTokenSurface` check (`!JSON.stringify(snapshot).toLowerCase().includes('token')`) must be preserved and should be strengthened as part of Phase 2.9 skeleton work.

---

## 9. Onboarding Page Real-Auth Flow

The onboarding page (`surfaces/identity/identity.html`) is the sole user-facing surface for authentication in MVP. It is a product-owned H2O / Cockpit Pro surface — it must not imply ChatGPT or OpenAI account ownership.

### MVP UX Sequence

```
Step 1 — Email Entry
  User sees: "Create your Cockpit Pro account" (NOT "Create ChatGPT account")
  User enters email address
  User clicks "Send code"
  Page sends: identity:request-email-otp { email }
  Background returns: { ok, emailMasked, nextStatus: 'email_pending' }
  H2O.Identity transitions to: EMAIL_PENDING
  Page shows: "We sent a code to [emailMasked]. Check your inbox."

Step 2 — Code Entry
  User opens email, reads 6-digit code
  User enters code in onboarding page
  User clicks "Verify"
  Page sends: identity:verify-email-otp { email, code }
  Background returns: { ok, nextStatus: 'verified_no_profile' } or { ok: false, errorCode }
  On success: H2O.Identity transitions to VERIFIED_NO_PROFILE
  On failure: show error ("Incorrect or expired code. Try again."), stay on Step 2

Step 3 — Profile Setup
  User sees: "Set up your profile"
  User enters display name (required)
  User may see pre-populated fields from existing local profile (if local profile exists)
  User confirms / submits
  Page sends: identity:create-profile { displayName, avatarColor? }
    → if local profile exists and user confirmed migration:
       also sends: identity:attach-local-profile { localProfileId, ... }
  H2O.Identity transitions to: PROFILE_READY

Step 4 — Workspace
  Page sends: identity:create-workspace { name? }
    → if local workspace exists and user confirmed migration:
       also sends: identity:migrate-local-workspace { localWorkspaceId, name }
  H2O.Identity transitions to: SYNC_READY

Step 5 — Complete
  Page shows: "You're set up with Cockpit Pro."
  Onboarding window closes or shows completion state.
  H2O.Identity emits h2o:identity:changed
  FirstRunPrompt evaluates and hides (READY_STATUSES includes sync_ready)
  Control Hub Account tab reflects new state
```

### Resend and Error States

Resend OTP ("Send a new code") and per-step error handling are planned for Phase 3.1 / 3.2. The MVP flow must handle the happy path. Error display is required from Phase 3.1 forward.

### Copy Rules

- Never use the words "ChatGPT", "OpenAI", "your OpenAI account", "your ChatGPT account".
- Always use "Cockpit Pro", "H2O", "your H2O account", "your Cockpit Pro workspace".
- Email disclaimer: make clear this is a Cockpit Pro / H2O account, not a ChatGPT registration.

---

## 10. MVP Supabase Schema

> **Illustrative only.** The following tables and fields define the conceptual schema contract. No SQL migration is executed as part of this document. Field types and exact DDL are determined at Phase 3.0 setup.

### Table: `profiles`

| Purpose | One row per authenticated user. Owned by `auth.users`. |
|---|---|
| **Relationship** | `profiles.id` references `auth.users(id) ON DELETE CASCADE` |
| **MVP Required** | Yes |

| Field | Type (illustrative) | Notes |
|---|---|---|
| `id` | uuid PK | Same as `auth.users.id` |
| `display_name` | text | User-chosen name; nullable until set |
| `avatar_color` | text | Hex color string |
| `plan` | text | `'free'` \| `'pro'` — default `'free'` |
| `account_status` | text | Mirrors state machine: `'verified_no_profile'` → `'profile_ready'` → `'sync_ready'` |
| `local_profile_id` | text nullable | Migration: opaque identifier from pre-cloud local profile |
| `migrated_at` | timestamptz nullable | Set when local profile is attached to cloud profile |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Updated on every write |

### Table: `workspaces`

| Purpose | H2O / Cockpit Pro workspace. One per user at MVP. Team expansion deferred. |
|---|---|
| **Relationship** | `workspaces.owner_id` references `auth.users(id)` |
| **MVP Required** | Yes |

| Field | Type (illustrative) | Notes |
|---|---|---|
| `id` | uuid PK | Generated |
| `owner_id` | uuid FK | References `auth.users(id)` |
| `name` | text | User-chosen workspace name |
| `local_workspace_id` | text nullable | Migration: opaque local workspace identifier |
| `migrated_at` | timestamptz nullable | Set when local workspace is attached |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Updated on every write |

### Table: `workspace_memberships`

| Purpose | Links users to workspaces with a role. Enables future team expansion without schema changes. |
|---|---|
| **Relationship** | References `workspaces(id)` and `auth.users(id)` |
| **MVP Required** | Yes (even for solo users — owner gets an `'owner'` row at workspace creation) |

| Field | Type (illustrative) | Notes |
|---|---|---|
| `id` | uuid PK | Generated |
| `workspace_id` | uuid FK | References `workspaces(id) ON DELETE CASCADE` |
| `user_id` | uuid FK | References `auth.users(id) ON DELETE CASCADE` |
| `role` | text | `'owner'` \| `'member'` \| `'viewer'` — default `'owner'` |
| `joined_at` | timestamptz | Default `now()` |
| Unique constraint | | `(workspace_id, user_id)` |

### Table: `identity_devices` (Optional at MVP)

| Purpose | Device/session metadata for multi-device support and diagnostics. |
|---|---|
| **MVP Required** | No — add in Phase 3.3 when mobile alignment begins |

| Field | Type (illustrative) | Notes |
|---|---|---|
| `id` | uuid PK | Generated |
| `user_id` | uuid FK | References `auth.users(id) ON DELETE CASCADE` |
| `device_type` | text | `'chrome_extension'` \| `'ios'` \| `'android'` \| `'web'` |
| `device_label` | text nullable | User-visible label |
| `last_seen_at` | timestamptz | Updated on each sign-in / session refresh |
| `created_at` | timestamptz | Default `now()` |

### Table: `local_migrations` (Optional at MVP)

| Purpose | Audit trail for local-to-cloud profile/workspace migrations. Preserves migration history. |
|---|---|
| **MVP Required** | No — add if explicit migration wizard is implemented |

| Field | Type (illustrative) | Notes |
|---|---|---|
| `id` | uuid PK | Generated |
| `user_id` | uuid FK | References `auth.users(id) ON DELETE CASCADE` |
| `migration_type` | text | `'profile'` \| `'workspace'` |
| `local_id` | text | The opaque local identifier that was migrated |
| `cloud_id` | uuid | The cloud row that now owns the migrated data |
| `migrated_at` | timestamptz | Default `now()` |

### What is NOT in this schema (intentionally)

- Billing or subscription data — use Stripe customer portal
- Provider OAuth credentials — Supabase intentionally does not store these
- Session tokens — live in `chrome.storage.session`/`chrome.storage.local`/Keychain
- Highlight, MiniMap, or pagination data — remain in their existing storage systems

Reference: [Supabase user data / profiles](https://supabase.com/docs/guides/auth/managing-user-data) · [Supabase Auth](https://supabase.com/docs/guides/auth) · [Supabase sessions](https://supabase.com/docs/guides/auth/sessions)

---

## 11. RLS Policy Requirements

> **Conceptual only.** Exact `CREATE POLICY` SQL is determined at Phase 3.0. All tables must have RLS enabled before any row is written.

Reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

### `profiles`
- `SELECT`: user can read own row only (`id = auth.uid()`)
- `UPDATE`: user can update own row only
- `INSERT`: user can insert own row only (auto-created on first OTP verification)
- `DELETE`: cascade from `auth.users` — not user-triggered directly

### `workspaces`
- `SELECT`: user can read workspaces where they have a `workspace_memberships` row
- `INSERT`: user can create workspaces where they will be owner
- `UPDATE`: owner can update own workspaces
- `DELETE`: owner can delete own workspaces

### `workspace_memberships`
- `SELECT`: user can read memberships for workspaces they belong to
- `INSERT`: workspace owner can insert new memberships (Phase 3.4+ for team features)
- `DELETE`: workspace owner can remove memberships; member can remove themselves

### `identity_devices` (if implemented)
- `SELECT`, `INSERT`, `UPDATE`, `DELETE`: user can manage own device rows only (`user_id = auth.uid()`)

### `local_migrations` (if implemented)
- `SELECT`, `INSERT`: user can read/write own migration rows only (`user_id = auth.uid()`)
- `UPDATE`, `DELETE`: not permitted — migrations are append-only audit records

### Global rule
No authenticated user may read another user's data in any table. No table may be left without an RLS policy after creation.

---

## 12. Local/Mock to Cloud Migration

### State Machine (unchanged structure, new `provider_backed` mode)

```
anonymous_local ──► email_pending ──► verified_no_profile ──► profile_ready ──► sync_ready
                                                                                      │
                                              auth_error ◄────────────────────────────┘
                                                  │
                                                  └──► (retry back to email_pending)

[dev_local] ── permanent side-channel; bypasses all cloud auth; never visible to end users
```

In Phase 3, `mode` changes from `'local_dev'` to `'provider_backed'` and `provider` changes from `'mock_local'` to `'supabase'` when real OTP is used. These fields already exist in the `normalizeSnapshot` code path.

### Migration Cases

**Case A — Fresh user, no prior local profile**

No migration needed. User proceeds directly through the onboarding flow. Profile and workspace are created in Supabase. No local data to carry forward.

**Case B — User has existing local mock profile**

At `verified_no_profile` → `profile_ready` step:
1. Onboarding detects existing local profile in `H2O.Identity.getProfile()`.
2. Onboarding presents explicit confirmation: "We found a local profile (`[displayName]`). Copy it to your Cockpit Pro account? [Copy] [Start fresh]"
3. If user confirms: send `identity:attach-local-profile { localProfileId, displayName, ... }`.
4. Background writes profile to Supabase with `local_profile_id` and `migrated_at` set.
5. Local profile data is preserved read-only locally; it is not deleted.

Migration must be **explicit, not silent**. Do not auto-overwrite without user confirmation.

**Case C — User has existing local workspace**

At `profile_ready` → `sync_ready` step:
1. Onboarding detects existing local workspace in `H2O.Identity.getWorkspace()`.
2. Onboarding presents explicit confirmation: "We found a local workspace (`[name]`). Attach it to your Cockpit Pro account? [Attach] [Create new]"
3. If user confirms: send `identity:migrate-local-workspace { localWorkspaceId, name }`.
4. Background writes workspace to Supabase with `local_workspace_id` and `migrated_at` set.

**Case D — Multiple devices**

Each device authenticates independently with the same email via OTP. The background on each device rehydrates from Supabase using the same `user.id`. Local per-device state (e.g., page `localStorage` snapshot) is overwritten by the cloud profile on sign-in. No session is shared between devices — each holds its own refresh token.

**Case E — `dev_local` mode**

`dev_local` mode bypasses Supabase entirely. It is gated by a build-time constant or an explicit developer toggle accessible only from the extension context (not page context, not end-user UI). It remains permanently available. In `dev_local` mode: `mode = 'local_dev'`, `provider = 'mock_local'`. No cloud API calls are made. This mode must not be reachable by production end users.

---

## 13. Mobile Alignment

### Same Supabase Project

The mobile app (iOS / React Native / Expo) uses the same Supabase project as the Chrome extension. `auth.users`, `profiles`, `workspaces`, and `workspace_memberships` are shared. The same `user.id` appears on both devices.

### Same OTP Flow

Mobile uses the identical email OTP flow. No redirect URI needed for OTP on mobile either. The mobile app calls `supabase.auth.signInWithOtp({ email })` and `supabase.auth.verifyOtp({ email, token, type: 'email' })` directly.

### Independent Device Sessions

The mobile app holds its own access and refresh tokens in the iOS Keychain / `expo-secure-store`. These are independent from the extension's session. Both are valid simultaneously. There is no session sharing between extension and mobile app — only shared identity and shared cloud data.

### Token Storage on Mobile

- Access token: in-memory (`useSession` state or equivalent)
- Refresh token: `expo-secure-store` (Expo/React Native) or `KeychainServices` (Swift/UIKit)
- Forbidden: `UserDefaults`, `AsyncStorage`, plain file system, `mmkv` without encryption

Reference: [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)

### Future Magic Links on Mobile

Magic links on mobile require a universal link configuration (`apple-app-site-association` file on the domain + `NSUserActivityTypes` in Info.plist). The mobile app intercepts the Supabase redirect via the universal link handler. This is Phase 3.5 work — it requires the production domain to be registered.

### Mobile Framework Decision

The final mobile framework choice (Expo/React Native vs native Swift/UIKit) is an open question (see Section 17). The architecture described here works for both.

### No session sharing

The extension and mobile app never pass tokens to each other. Their only connection is the shared Supabase user identity and the shared cloud profile/workspace data.

---

## 14. Phase 2.9 Adapter Skeleton Requirements

Phase 2.9 is the first coding phase after this document. It remains **fully mock-backed** — no real Supabase calls, no credentials, no provider SDK.

### What Phase 2.9 adds

1. **`AuthSessionManager` skeleton** inside the extension background. All methods are mock-backed: they receive bridge commands and return plausible derived responses without touching Supabase.

2. **New bridge command handlers** in the background for the commands defined in Section 7: `identity:request-email-otp`, `identity:verify-email-otp`, `identity:get-derived-state`, `identity:refresh-session`, `identity:sign-out`, `identity:create-profile`, `identity:create-workspace`, `identity:attach-local-profile`, `identity:migrate-local-workspace`.

3. **Sanitization enforcement**: Every new bridge response passes through a sanitization step that strips `/token|secret|password|refresh/i` keyed fields. This is in addition to the existing `sanitizeForBridge()` in `H2O.Identity`.

4. **`H2O.Identity` wiring**: The page-side `H2O.Identity` is updated to route `signInWithEmail()`, `verifyEmailCode()`, `createInitialWorkspace()`, and related methods through the new bridge commands instead of performing purely local state changes. In mock mode, the result is identical to today — state advances locally. In Phase 3, the advance is driven by the background.

5. **No Supabase SDK or keys**: `supabase-js` is not imported. No `SUPABASE_URL` or `SUPABASE_ANON_KEY` appears in any file.

6. **No secrets**: No credentials are added to the repo.

### What Phase 2.9 must validate

After Phase 2.9 implementation:
- `H2O.Identity.selfCheck()` passes with `ok: true`.
- `H2O.IdentityFirstRunPrompt.selfCheck()` passes with `ok: true`.
- Control Hub Account tab renders identity status correctly using the new derived snapshot shape.
- `H2O.IdentityFirstRunPrompt.evaluate()` hides correctly after `SYNC_READY`.
- `H2O.IdentityFirstRunPrompt.forceShow()` still works for Ops Panel testing.
- No token string appears in any bridge response or snapshot.
- `diag()` output contains no raw email (only masked).

### What Phase 2.9 must NOT do

- Must not call any real Supabase API.
- Must not add `supabase-js` to any script.
- Must not change `config/dev-order.tsv`.
- Must not break existing MiniMap, Highlights, Pagination, Transcript, or Command Bar functionality.

---

## 15. Phase 3 Implementation Sequence

### Phase 3.0 — Supabase Project Setup + Background Provider Runtime

- Create Supabase project (dev environment first).
- Configure: email OTP auth, custom SMTP provider for delivery, OTP email template with `{{ .Token }}`.
- Add `supabase-js` to the extension background only (not page scripts).
- Initialize real Supabase client inside `AuthSessionManager`.
- Wire `identity:request-email-otp` and `identity:verify-email-otp` to real Supabase calls.
- Session stored in `chrome.storage.session` after OTP verification.
- Internal testing only — not shipped to users.

### Phase 3.1 — Email OTP Request / Verify

- Onboarding page UI finalized for real auth flow (email entry → code entry → profile setup).
- Error handling: expired code, wrong code, resend OTP, rate limiting.
- H2O.Identity transitions: `email_pending` → `verified_no_profile` driven by real OTP result.
- Ship to beta users.

### Phase 3.2 — Session Refresh / Sign-Out / Error Handling

- `chrome.alarms`-based proactive session refresh (wake service worker before access token expiry).
- Service worker startup rehydration sequence (read → setSession → refreshIfExpired → publish).
- Full sign-out flow (Supabase signOut + storage clear + H2O.Identity reset).
- Account recovery planning (out of scope for this phase — document gap).
- Magic link optional: add hosted callback page at production domain if domain is registered.

### Phase 3.3 — Mobile Alignment

- Implement same Supabase OTP flow in iOS/Expo app.
- Token storage: iOS Keychain via `expo-secure-store`.
- Verify: sign in on iPhone, same profile visible in extension (shared cloud data).
- Universal link setup if magic links are to be supported on mobile.
- `identity_devices` table introduction (optional).

### Phase 3.4 — Cloud Profile / Workspace Sync

- Create `profiles` and `workspaces` tables with RLS policies.
- Profile auto-creation on first successful OTP verification.
- Workspace creation and `workspace_memberships` at profile setup step.
- Local-to-cloud migration wizard for existing users with local mock profiles.
- Control Hub Data tab: show cloud sync status using `syncReady` field.

### Phase 3.5 — Optional: Magic Link / OAuth

- Magic link: requires production domain, hosted callback page, `externally_connectable` manifest config.
- OAuth / social: requires `chrome.identity.launchWebAuthFlow`, OAuth app setup per provider, extension ID in provider authorized domains.
- Neither is a regression from Phase 3.0–3.4. Both are additive convenience features.

---

## 16. Do-Not-Do Rules

These rules are unconditional. They apply at every phase.

| Do not do | Reason |
|---|---|
| **Do not start with magic links.** | Requires hosted relay page, is vulnerable to email security scanners, adds redirect URI complexity that OTP avoids. |
| **Do not start with OAuth.** | Requires `launchWebAuthFlow` setup, OAuth app registration per provider, extension ID config. Out of scope for MVP. |
| **Do not add password auth.** | Adds credential storage, hashing, reset flows. Incompatible with a lean OTP-first MVP. |
| **Do not use `chrome-extension://` as the primary email callback URI.** | Not reliably opened by email clients; Chrome may block external navigation to extension URLs. |
| **Do not expose tokens to page scripts.** | Any page script on chatgpt.com can be read by XSS or third-party scripts. Token boundary is absolute. |
| **Do not store token-like fields in H2O.Identity public snapshot.** | `getSnapshot()` is accessible to all H2O page scripts and to any observer of `h2o:identity:changed`. |
| **Do not make Control Hub or Ops Panel auth owners.** | They are consumers and testing entry points. Auth ownership belongs exclusively to `H2O.Identity` (page facade) + `AuthSessionManager` (background). |
| **Do not remove or disable local/dev mode.** | It is a permanent developer tool. Gate it; do not remove it. |
| **Do not silently overwrite local profile/workspace data.** | Migration must be explicit. User must confirm attach/copy. Silent overwrite destroys data. |
| **Do not build a custom auth backend for MVP.** | A security-correct custom JWT service is 4–8 weeks of work. Supabase provides the same capability with self-hosting portability. |
| **Do not store tokens in `chrome.storage.sync`.** | Sync storage replicates across all Chrome profiles. Tokens must not follow the user across browsers automatically. |
| **Do not use Firebase as the provider.** | Firebase does not support email OTP. Has no self-hosting path. Vendor lock-in is high. |
| **Do not use Clerk as the provider.** | Clerk explicitly blocks OAuth redirects in Chrome extensions. Has no self-hosting path. |
| **Do not store tokens in page `localStorage`.** | Shared with the host page (chatgpt.com). Any script on the page can read it. |

---

## 17. Open Questions Before Phase 2.9

These must be resolved before Phase 2.9 implementation begins. They do not affect this architecture document but will affect implementation decisions.

1. **Supabase project naming convention**: Will there be separate `h2o-dev`, `h2o-staging`, and `h2o-prod` Supabase projects, or a single project with environment segregation via RLS? Recommendation: separate dev and prod at minimum.

2. **Production domain for future magic link / universal link**: Is `cockpitpro.app` confirmed? Or another domain? This is needed for Phase 3.2 magic link and Phase 3.3 universal links. The OTP MVP does not require it.

3. **SMTP provider for email delivery**: Supabase's default email sender is for prototyping only (rate-limited, not reliable for production). Which SMTP provider: Resend, Postmark, or another? Needed before Phase 3.1 beta.

4. **OTP expiry duration**: Supabase default is 1 hour. Is this acceptable for H2O / Cockpit Pro users? If shorter, set in Supabase Auth settings. If users will likely switch devices between requesting and entering the code, 1 hour is recommended.

5. **OTP resend cooldown**: How many seconds before "Send a new code" is re-enabled? 30s or 60s? Affects onboarding page UX design.

6. **Remember device / persistent session**: Should the refresh token be persisted in `chrome.storage.local` across browser restarts ("stay signed in")? Or should users re-authenticate per browser session? This affects Phase 3.0 storage decisions.

7. **Local profile migration UX**: Is migration an explicit wizard during onboarding, or a passive suggestion shown after first cloud sign-in? Explicit wizard is recommended (see Section 12).

8. **Profile creation timing**: Is the `profiles` row created immediately on OTP verification (auto-created with email prefix as display name), or only after the user submits the profile form? Auto-creation is simpler but requires a subsequent update step. Recommendation: auto-create with defaults, let user update in onboarding.

9. **Exact storage key names for Phase 3 auth session**: The current mock key is `"h2oIdentityMockSnapshotV1"`. The Phase 3 auth session key should be distinct. Proposed: `"h2o:auth:session:v1"` for the session object in `chrome.storage.session`, and `"h2o:auth:refresh:v1"` for the persisted refresh material in `chrome.storage.local`. Confirm before Phase 2.9.

10. **Extension ID stability**: The extension CRX ID must be stable (fixed key in `manifest.json`) for `externally_connectable` configuration to work reliably in Phase 3.2+. Confirm this is already fixed in the build, or add it.

11. **Mobile framework final choice**: Expo / React Native, or native Swift / SwiftUI? The Supabase client exists for both (`supabase-js` with Expo, `supabase-swift` for native). Architecture supports both; implementation details differ. Confirm before Phase 3.3.

12. **Enum / status field names in DB**: Should `account_status` values in the `profiles` table mirror the JavaScript `STATES` enum exactly (e.g., `'verified_no_profile'`) or use a separate server-side convention? Mirroring is simpler.

---

## 18. Pre-Phase-2.9 Notes (Code Inspection Findings)

The following observations were made during preflight inspection of the current identity scripts and extension tools. They are informational — **no changes were made**. They should be addressed or noted at the start of Phase 2.9.

**Note 1 — Storage key collision risk**

The current background uses `IDENTITY_STORAGE_KEY = "h2oIdentityMockSnapshotV1"` (in `chrome-live-background.mjs`) for the mock snapshot. Phase 2.9's `AuthSessionManager` must use distinct keys for real auth session material (e.g., `"h2o:auth:session:v1"`, `"h2o:auth:refresh:v1"`). The mock key must not be reused for real session data. When Phase 3 goes live, the mock key should be deprecated and cleared on sign-in.

**Note 2 — `handleVerificationCallback()` is a magic-link stub, not real callback handling**

`H2O.Identity.handleVerificationCallback(urlOrLocation)` exists in `0D4a` and advances the mock state machine to `VERIFIED_NO_PROFILE` by reading an email from a URL's search params. This is a mock placeholder for a future magic-link callback flow. It must **not** be wired to a real Supabase magic link callback in Phase 3.1 (magic links are deferred to Phase 3.5). The function should remain as-is and mock-backed through Phase 3.4. It is not exposed in the Phase 2.9 bridge contract.

**Note 3 — `sanitizeForBridge()` pattern must be preserved and extended**

The existing `sanitizeForBridge()` in `0D4a` (strips keys matching `/token|secret|password|refresh/i`) is the primary defense against tokens leaking through the bridge. Every new bridge response handler added in Phase 2.9 must apply an equivalent filter. This filter does not currently strip email addresses — masked email (`emailMasked`) should be the only email-related field in bridge responses, and raw `pendingEmail` must be dropped.

**Note 4 — `normalizeSnapshot()` already accepts `provider_backed` mode**

The existing `normalizeSnapshot()` code in `0D4a` already accepts `mode: 'provider_backed'` as a valid value (`value.mode === 'provider_backed' ? 'provider_backed' : 'local_dev'`). Phase 3.0 uses this existing code path — no new mode string is needed. Similarly, the `provider` field already accepts arbitrary strings; Phase 3.0 sets it to `'supabase'`.

**Note 5 — `storageSessionArea()` already exists in the background**

`chrome-live-background.mjs` already contains a `storageSessionArea()` function that returns `chrome.storage.session` when available (with `chrome.storage.local` as fallback). This is the correct slot for active access token storage in Phase 3. The Phase 2.9 `AuthSessionManager` should reference and use this existing function for its session-scope storage operations.

**Note 6 — Page `localStorage` receives the snapshot today; this is architecturally safe if limited to derived state**

`H2O.Identity.persistAndNotify()` currently writes the snapshot to page `localStorage` at `h2o:prm:cgx:identity:v1:snapshot`. In Phase 3, this write must continue to write only the sanitized derived snapshot (no token fields). The current code path already ensures this through `normalizeSnapshot()` and `sanitizeForBridge()`. The localStorage write should not be removed — it enables the page-side `H2O.Identity` to boot from a cached snapshot before the bridge hydration completes.

**Note 7 — Loader already handles identity bridge relay; no loader changes needed for Phase 2.9**

`chrome-live-loader.mjs` already handles `MSG_IDENTITY_REQ = "h2o-ext-identity:v1:req"` and `MSG_IDENTITY_RES = "h2o-ext-identity:v1:res"` relay. New bridge commands added in Phase 2.9 use the same message type with a new `action` string — they will be relayed automatically by the existing loader without loader modifications.

**Note 8 — Control Hub Account tab identity section (Phase 2.7A) is a pure consumer**

The `CHUB_IDENTITY_*` functions in `0Z1a` read from `H2O.Identity.diag()`, `getSnapshot()`, `getProfile()`, `getWorkspace()` and call `openOnboarding()`, `refreshSession()`, `signOut()`. None of these functions own identity state. The Account tab will automatically reflect Phase 3 state once `H2O.Identity` is backed by real auth — no Control Hub changes are needed for Phase 2.9 or 3.0.

---

## 19. Validation Checklist

- [x] Document created at `docs/identity/IDENTITY_PHASE_2_8_ARCHITECTURE.md`
- [x] No runtime scripts changed (`scripts/`, `tools/`, `surfaces/`)
- [x] `config/dev-order.tsv` not changed
- [x] No Supabase keys or credentials added anywhere
- [x] No provider SDK (`supabase-js`) added
- [x] No database migrations executed
- [x] Document states final accepted provider decision (Supabase Auth)
- [x] Document defines token and session boundary (Section 5)
- [x] Document defines bridge command contract (Section 7)
- [x] Document defines derived snapshot shape with forbidden fields (Section 8)
- [x] Document defines MVP cloud schema (Section 10)
- [x] Document defines RLS policy requirements (Section 11)
- [x] Document defines migration strategy (Section 12)
- [x] Document defines Phase 2.9 adapter skeleton requirements (Section 14)
- [x] Document defines Phase 3 implementation sequence (Section 15)
- [x] Document includes Do-Not-Do rules (Section 16)
- [x] Document includes open questions that must be answered before Phase 2.9 (Section 17)
- [x] Pre-Phase-2.9 code inspection notes included (Section 18)
- [x] Phase 2.9 is NOT started in this document

---

## 20. Official References

All links point to official documentation. No internal or speculative sources.

| Topic | Reference |
|---|---|
| Supabase Auth overview | https://supabase.com/docs/guides/auth |
| Supabase email OTP / passwordless | https://supabase.com/docs/guides/auth/auth-email-passwordless |
| Supabase `signInWithOtp` | https://supabase.com/docs/reference/javascript/auth-signinwithotp |
| Supabase `verifyOtp` | https://supabase.com/docs/reference/javascript/auth-verifyotp |
| Supabase sessions | https://supabase.com/docs/guides/auth/sessions |
| Supabase user data / profiles | https://supabase.com/docs/guides/auth/managing-user-data |
| Supabase RLS | https://supabase.com/docs/guides/database/postgres/row-level-security |
| Chrome storage API | https://developer.chrome.com/docs/extensions/reference/api/storage |
| Chrome identity API | https://developer.chrome.com/docs/extensions/reference/api/identity |
| Chrome MV3 service workers | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers |
| Firebase Chrome extension auth (comparison only) | https://firebase.google.com/docs/auth/web/chrome-extension |
| Clerk Chrome extension docs (comparison only) | https://clerk.com/docs/references/chrome-extension/overview |
| Expo SecureStore (mobile) | https://docs.expo.dev/versions/latest/sdk/securestore/ |
