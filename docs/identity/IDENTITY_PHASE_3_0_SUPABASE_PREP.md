# Identity Phase 3.0 Supabase Prep

**Status:** Documentation and implementation contract only  
**Date:** 2026-04-28  
**Preceding phase:** Identity Phase 2.9 mock-backed provider adapter skeleton  
**Future implementation target:** Supabase Auth email OTP, owned by the extension background

This document defines the contract for replacing the Phase 2.9 mock adapter with Supabase later. It does not start real Supabase auth, add provider SDKs, add real provider configuration, or change current identity behavior.

## 1. Phase 2.9 Baseline Summary

Phase 2.9 is mock-backed and working. The page-side `H2O.Identity` facade remains the public API for ChatGPT-page scripts and surfaces, while the extension background now contains a mock `AuthSessionManager`-style section that handles provider-shaped bridge commands without external calls or real tokens.

The current baseline is:

| Area | Phase 2.9 behavior |
|---|---|
| Public facade | `scripts/0D4a... Identity Core` exposes `H2O.Identity` with the existing state machine and public methods. |
| Background owner | `tools/product/extension/chrome-live-background.mjs` handles identity bridge commands and stores mock runtime state under `h2oIdentityProviderMockRuntimeV1`. |
| Bridge relay | `tools/product/extension/chrome-live-loader.mjs` allow-lists identity commands and relays page requests to the background. |
| Shared snapshot | Background uses `h2oIdentityMockSnapshotV1` for a sanitized mock snapshot. Page `localStorage` keeps only a derived snapshot and audit trail. |
| Onboarding surface | `surfaces/identity/identity.js` drives the local/mock email, verify, profile, workspace, local mode, and reset flows through `H2O.Identity`. |

Popup -> background -> ChatGPT page sync now works. The popup can complete onboarding through `identity:complete-onboarding`; the background stores runtime plus snapshot state, broadcasts a sanitized `h2o-ext-identity:v1:push`, the loader forwards that push into the page, and `H2O.Identity` applies it through `applySharedSnapshot()`.

`refreshSession()` now pulls shared state first through `identity:get-snapshot`. If the bridge has a richer or newer snapshot, page state is hydrated from the shared background-owned snapshot before the local fallback refresh path runs.

`signOut()` now calls `identity:sign-out`, which clears mock runtime state and the shared snapshot, broadcasts a null push, and resets the page runtime to `anonymous_local`. The current working flow must remain preserved until Phase 3 code explicitly replaces the mock provider internals.

## 2. Supabase Integration Goals

| Goal | Contract |
|---|---|
| Email OTP MVP | Start with email OTP code entry only. The user enters an email, receives a code, enters the code in the H2O / Cockpit Pro onboarding page, and the background verifies it. |
| Background-owned runtime | Supabase client, raw provider session, access token, refresh token, and refresh policy are owned only by the extension background. |
| Preserve API | Preserve `H2O.Identity` public methods, events, snapshots, diagnostics, and local boot behavior for consumers. |
| Preserve local/dev mock mode | Keep `mode: "local_dev"` and `provider: "mock_local"` available for local development and test paths. |
| Token-free public state | Page/public identity state is a safe derived snapshot only. It never contains raw provider session material. |

## 3. Non-Goals and Strict Boundaries

| Boundary | Rule |
|---|---|
| Magic links | No magic links in the initial implementation. They require production callback/domain work and are deferred. |
| OAuth | No OAuth in the initial implementation. OAuth later must use the correct browser redirect strategy and separate provider setup. |
| Password login | No password login for MVP. |
| Billing, subscriptions, teams | No billing, subscription, team management, invitations, or entitlement features in Phase 3.0. |
| Page token exposure | No provider tokens, auth codes, OTP hashes, or raw provider sessions may reach page scripts. |
| Control Hub/Ops Panel ownership | No provider state inside Control Hub or Ops Panel. They stay consumers/testing entry points, not auth owners. |

## 4. AuthSessionManager Responsibilities

The future background-owned `AuthSessionManager` is the sole owner of provider session state and provider calls. It replaces the mock internals without changing the public page contract.

| Responsibility | Contract |
|---|---|
| Initialize provider adapter | Lazily initialize the configured provider adapter in the background only. No page script initializes Supabase. |
| Request email OTP | Validate and normalize the email, call the provider adapter, store pending safe state, and return only safe output. |
| Verify email OTP | Verify the email/code pair, store raw provider session internally, and publish only derived state. |
| Refresh session | Hydrate session state, refresh when needed, update internal storage, and publish derived state. |
| Sign out | Attempt provider sign-out, clear runtime and persisted session material, clear derived snapshot, and broadcast reset. |
| Hydrate on service-worker wake | Load session material from background-owned storage, rebuild runtime state, validate expiry, and publish a safe snapshot. |
| Create/attach profile | Create or load the user's H2O / Cockpit Pro profile after verification. |
| Create/attach workspace | Create or load the user's default workspace and membership after profile readiness. |
| Publish safe derived state | Produce the only state allowed to cross the bridge or enter `H2O.Identity`. |
| Redaction/error normalization | Convert provider errors into stable `identity/*` codes and user-safe messages. |
| Raw session boundary | Never expose raw provider session, raw user object, tokens, OTP hashes, provider response objects, or secrets. |

## 5. Supabase Provider Adapter Interface

This is a conceptual adapter contract, not implementation code. Phase 3 may implement it as module functions, a closure, or a class, but the behavior and boundaries are fixed.

| Method | Input | Safe result | Internal-only result or side effect |
|---|---|---|---|
| `requestEmailOtp(email)` | Normalized email string | `{ ok, emailMasked, nextStatus }` or redacted error | Provider request metadata only if needed for retry/cooldown. |
| `verifyEmailOtp(email, code)` | Normalized email and user-entered code | `{ ok, nextStatus, emailMasked }` or redacted error | Stores raw provider session internally. |
| `getSession()` | None | Derived session presence/expiry summary only | Reads raw provider session internally. |
| `refreshSession()` | None | `{ ok, updatedAt, nextStatus }` or redacted error | Updates raw provider session internally. |
| `signOut()` | None | `{ ok, nextStatus }` plus reset signal | Clears provider runtime and persisted session material. |
| `getUser()` | None | Derived user identity summary only | Reads provider user internally. |
| `createOrLoadProfile()` | Verified provider user plus optional profile input | Safe profile summary | Inserts/selects `profiles` row through background/provider context. |
| `createOrLoadWorkspace()` | Profile/user plus optional workspace input | Safe workspace summary | Inserts/selects `workspaces` and `workspace_memberships`. |
| `migrateLocalProfile()` | Explicit user-approved local profile summary | Migration result plus safe profile summary | Writes migration metadata. Never overwrites silently. |
| `toDerivedSnapshot()` | Internal runtime/session/profile/workspace state | Safe public snapshot | Redacts provider fields and normalizes errors. |

The adapter may return stable error codes such as `identity/invalid-email`, `identity/otp-invalid`, `identity/otp-expired`, `identity/resend-cooldown`, `identity/refresh-failed`, `identity/network-failed`, `identity/provider-unavailable`, `identity/migration-conflict`, and `identity/sign-out-failed`.

## 6. Background-Only Token/Session Boundary

The token boundary is non-negotiable:

| Rule | Contract |
|---|---|
| Active runtime session | Access/session runtime state lives in background memory and/or `chrome.storage.session`. |
| Persisted session material | Refresh/session material may use `chrome.storage.local` only through background `AuthSessionManager`. |
| `H2O.Identity` snapshot | No tokens, provider session, provider user object, OTP hash, auth code, password, or secret. |
| Page scripts | No tokens or raw session material in ChatGPT page scripts. |
| ChatGPT localStorage | No tokens or raw session material in ChatGPT `localStorage`. |
| Control Hub/Ops Panel | No tokens, provider state, or raw auth responses in Control Hub or Ops Panel. |
| Mobile | Mobile uses Keychain, SecureStore, or equivalent secure storage for token material. |

Phase 3 must continue sanitizing bridge output using a denylist at least as strict as the current `/token|secret|password|refresh|credential/i` patterns. Sanitization is a guardrail, not the primary design; raw provider session objects should never be passed to the sanitizer in the first place.

## 7. Storage Policy

| Category | Owner | Storage location | May contain secrets? | Notes |
|---|---|---|---|---|
| Public derived snapshot | `H2O.Identity` and background publisher | Page `localStorage` snapshot key and `chrome.storage.local` shared derived snapshot key | No | Contains only safe snapshot fields. May be cached for boot/hydration. |
| Mock runtime state | Background mock adapter | `chrome.storage.session` through the existing session storage helper, with current fallback behavior | No | Phase 2.9 local/dev only. No real tokens. |
| Provider runtime session state | Background `AuthSessionManager` | Background memory and/or `chrome.storage.session` | Yes | Access token/session object may exist here only. Not bridge-visible. |
| Persisted refresh/session material | Background `AuthSessionManager` | `chrome.storage.local`, distinct provider-owned key | Yes | Used only for stay-signed-in behavior. Never reused from mock keys. |
| Local/dev fallback state | `H2O.Identity` plus background mock adapter | Page `localStorage`, `chrome.storage.local` derived snapshot, `chrome.storage.session` mock runtime | No | Preserves current local/dev mode and validation behavior. |

Provider session keys must be distinct from `h2oIdentityMockSnapshotV1` and `h2oIdentityProviderMockRuntimeV1`. Mock keys are never repurposed for real provider session material.

## 8. Bridge Command Contract

All Phase 3 identity commands are owned by the background. The loader may relay allow-listed commands only. Page callers receive safe output only.

| Command | Caller | Background owner | Allowed input | Safe output | Forbidden output | Expected state transition |
|---|---|---|---|---|---|---|
| `identity:request-email-otp` | `H2O.Identity.signInWithEmail()` and onboarding page through the facade | `AuthSessionManager.requestEmailOtp` | `{ email }` normalized and validated | `{ ok, emailMasked, pendingEmailMasked, nextStatus: "email_pending" }` or redacted error | Raw provider response, OTP hash, token, session | `anonymous_local` or `auth_error` -> `email_pending` |
| `identity:verify-email-otp` | `H2O.Identity.verifyEmailCode()` and onboarding page through the facade | `AuthSessionManager.verifyEmailOtp` | `{ email, code }` with user-entered code | `{ ok, emailMasked, nextStatus }` plus safe derived snapshot if needed | Access token, refresh token, id token, provider token, raw session, raw user | `email_pending` -> `verified_no_profile` or later safe ready state after profile attach |
| `identity:refresh-session` | `H2O.Identity.refreshSession()`, background alarms, service-worker wake path | `AuthSessionManager.refreshSession` | Empty or safe refresh options | `{ ok, updatedAt, nextStatus }` and/or safe derived snapshot | Token, raw session, refresh internals | Keeps current status, or moves to `auth_error` on unrecoverable failure |
| `identity:sign-out` | `H2O.Identity.signOut()`, onboarding reset, Control Hub consumer action | `AuthSessionManager.signOut` | Optional safe reason/source | `{ ok, nextStatus: "anonymous_local" }` | Provider sign-out response, token, session | Any state -> `anonymous_local`; clears runtime, persisted material, shared snapshot, and page state |
| `identity:get-snapshot` | `H2O.Identity.tryHydrateFromBridge()` and `refreshSession()` | Background derived snapshot publisher | Empty | `{ ok, snapshot }` where snapshot is safe or null | Token, raw session, raw provider user | No state change unless page applies newer/richer snapshot |
| `identity:get-derived-state` | Diagnostic/UI consumers through bridge, future background-owned reads | `AuthSessionManager.toDerivedSnapshot` | Empty | `{ ok, derivedState }` using the safe public mapping | Token, raw session, raw provider user | No state change |
| `identity:complete-onboarding` or Phase 3 replacement | `H2O.Identity.createInitialWorkspace()` through onboarding flow | `AuthSessionManager.createOrLoadProfile` plus `createOrLoadWorkspace` | `{ displayName, avatarColor, workspaceName }` and explicit migration confirmation flags if applicable | `{ ok, nextStatus: "sync_ready", profile, workspace }` plus safe snapshot | Token, raw provider rows containing private columns, raw session | `verified_no_profile` -> `profile_ready` -> `sync_ready`; atomic from caller perspective |

If Phase 3 replaces `identity:complete-onboarding`, the replacement must stay atomic from the page caller's perspective. The Phase 2.9 split `create-profile` plus `create-workspace` race must not return.

## 9. Safe Public H2O.Identity Snapshot Mapping

Phase 3 public state must map to this safe derived snapshot shape:

| Field | Required contract |
|---|---|
| `version` | Public snapshot schema version. |
| `status` | One of `anonymous_local`, `email_pending`, `verified_no_profile`, `profile_ready`, `sync_ready`, `auth_error`. |
| `mode` | `local_dev` or `provider_backed`. |
| `provider` | `mock_local` in local/dev mode, `supabase` in provider-backed mode. |
| `providerKind` | `none`, `email_otp`, or future non-secret provider kind label. |
| `emailVerified` | Boolean derived from provider/user/profile state. |
| `emailMasked` | Masked verified email, never raw unless explicitly preserved by current public API policy. |
| `pendingEmailMasked` | Masked pending email during OTP request/verify. |
| `profile` summary | Null or `{ id, displayName, avatarColor, createdAt, updatedAt }`. No raw email unless intentionally retained as a safe public profile field in a later reviewed change. |
| `workspace` summary | Null or `{ id, name, role, createdAt, updatedAt }`. |
| `onboardingCompleted` | Boolean, true only when profile/workspace readiness is complete. |
| `syncReady` | Boolean, true only when cloud/profile/workspace state is ready to sync. |
| `lastError` redacted | Null or `{ code, message, at }`; no provider details, stack traces, tokens, request IDs with secret value, or raw response body. |
| `updatedAt` | ISO timestamp for the derived snapshot. |

The following fields are explicitly forbidden in `H2O.Identity` snapshots, bridge responses, page scripts, diagnostics, Control Hub, Ops Panel, and ChatGPT `localStorage`:

| Forbidden field |
|---|
| `access_token` |
| `refresh_token` |
| `id_token` |
| `provider_token` |
| `auth_code` |
| `otp_token_hash` |
| `password` |
| `secret` |
| Raw provider session |

## 10. Onboarding Page Phase 3 OTP Flow

The onboarding surface remains an H2O / Cockpit Pro account surface. It must not describe the flow as ChatGPT or OpenAI registration.

| Step | Flow contract |
|---|---|
| Enter email | User enters the email for their H2O / Cockpit Pro account. The page calls the existing `H2O.Identity` facade. |
| Request OTP | Facade sends `identity:request-email-otp`; background requests provider OTP; UI moves to pending state with masked email. |
| Enter OTP | User enters the code from email. No hardcoded mock code in provider-backed mode. |
| Verify OTP | Facade sends `identity:verify-email-otp`; background verifies, stores raw session internally, and returns safe derived state. |
| Create/load profile | Background creates or loads a `profiles` row for the verified user. |
| Create/load workspace | Background creates or loads the default `workspaces` row and owner `workspace_memberships` row. |
| `sync_ready` | Public snapshot reaches `sync_ready` only after profile and workspace are attached and safe derived state is published. |
| Resend OTP | UI calls `identity:request-email-otp` again with cooldown-aware error handling. |
| Error handling | UI displays user-safe messages for invalid email, wrong OTP, expired OTP, cooldown, network, provider unavailable, migration conflict, and refresh/sign-out issues. |

Product wording must use "H2O", "Cockpit Pro", "your H2O account", and "your Cockpit Pro workspace". Do not frame this as registering for ChatGPT or OpenAI.

## 11. Local/Mock to Supabase Migration Path

The state path is:

`anonymous_local -> email_pending -> verified_no_profile -> profile_ready -> sync_ready`

| Path | Contract |
|---|---|
| Fresh user | No local profile/workspace is attached. OTP verification creates or loads the provider user, then creates a new profile and workspace. |
| Existing local profile | Detect local profile summary. Ask the user before attaching/migrating it. If approved, migrate safe fields only and record local migration metadata. If declined, create a new cloud profile. |
| Existing local workspace | Detect local workspace summary. Ask the user before attaching/migrating it. If approved, migrate safe workspace fields only and record local migration metadata. If declined, create a new workspace. |
| Confirmation | Never silently overwrite or merge local data. Attachment/migration requires explicit user confirmation. |
| Local/dev mode | Local/dev mock mode remains available and bypasses Supabase entirely. It keeps `mode: "local_dev"` and `provider: "mock_local"`. |

Migration commands must not accept raw local storage dumps. They accept only minimal, safe summaries plus explicit user confirmation fields.

## 12. Error States and Recovery

| Error state | Normalized behavior | Recovery |
|---|---|---|
| Invalid email | Return `identity/invalid-email`; stay in or return to email entry. | User edits email and requests OTP again. |
| Wrong OTP | Return `identity/otp-invalid`; stay in `email_pending`. | User retries code or requests resend. |
| Expired OTP | Return `identity/otp-expired`; keep pending masked email. | User requests a new OTP. |
| Resend cooldown | Return `identity/resend-cooldown` with safe retry timing if available. | UI disables resend until cooldown expires. |
| Refresh failure | Return `identity/refresh-failed`; do not leak provider error. | Retry once if transient; otherwise show sign-in required and clear unsafe runtime state. |
| Network failure | Return `identity/network-failed`; keep last safe snapshot when appropriate. | Retry with backoff; user may continue in local/dev only if explicitly selected. |
| Service worker wake/restart | Hydrate through `AuthSessionManager` from background-owned storage. | Rebuild safe derived state, then broadcast/publish it. |
| Provider unavailable | Return `identity/provider-unavailable`. | Preserve local/dev mode; provider-backed sign-in waits for service recovery. |
| Migration conflict | Return `identity/migration-conflict` with safe conflict summary. | User chooses attach existing, create new, or cancel. |
| Sign-out failure | Return `identity/sign-out-failed` only if provider sign-out cannot complete, but still clear local runtime/session material when safe. | User may retry provider sign-out; page must reset to anonymous after local clear. |

No error response may include raw provider response bodies, stack traces, token-like strings, SQL details, or secrets.

## 13. Supabase Profile/Workspace Schema Dependency

Phase 3 depends conceptually on these tables. This document does not create SQL migration files and does not require executable SQL.

| Table | Conceptual purpose |
|---|---|
| `profiles` | One profile per authenticated user. Stores H2O / Cockpit Pro display profile, onboarding completion, optional local profile migration metadata, and timestamps. |
| `workspaces` | User-owned Cockpit Pro workspace. MVP can create one default workspace per user while preserving room for future teams. |
| `workspace_memberships` | Links users to workspaces with roles. The creating user receives an owner membership. |
| `identity_devices` | Optional table for per-device metadata, remember-device policy, and mobile/browser alignment. |
| `local_migrations` | Optional audit table for local profile/workspace migration decisions and conflict records. |

RLS requirements are conceptual but mandatory before real writes:

| RLS area | Requirement |
|---|---|
| `profiles` | Authenticated user can read/update only their own profile. Inserts must bind to their own provider user ID. |
| `workspaces` | Authenticated user can read workspaces where they have membership. Owners can update their own workspace. |
| `workspace_memberships` | Authenticated user can read memberships for workspaces they belong to. Owner-only mutation for future team features. |
| Optional tables | Device and migration rows must be readable only by the owning user or workspace member allowed by policy. |

No table used by Phase 3 may be left without RLS policy coverage.

## 14. Validation Plan

Validation after each future Phase 3 substep must prove that the working Phase 2.9 mock flow still works until deliberately replaced and that no token surface was introduced.

| Validation area | Commands/checks |
|---|---|
| Build | `npm run dev:rebuild` or the current extension rebuild command used by the repo. |
| Existing Phase 2.9 validation | `node tools/validation/identity/validate-identity-phase2_9.mjs` and `node tools/validation/identity/validate-identity-phase2_9-sync.mjs`. |
| No-token checks | Search modified source and built output for forbidden fields in public snapshots, diagnostics, bridge responses, and page storage. |
| SDK/config boundary | Verify no provider SDK is imported before the explicit install/config phase, and no keys/secrets/project URLs are committed. |
| Bridge consistency | Confirm loader allow-list, background handlers, `identity:get-snapshot`, `identity:get-derived-state`, and push broadcasts stay consistent. |
| Onboarding UI manual checks | Email request, OTP entry, resend, error display, local/dev mode, close/reset, profile/workspace creation, and product wording. |
| `refreshSession` pull checks | Verify page refresh/hydration pulls shared state from background before local fallback. |
| `signOut` reset checks | Verify runtime state, persisted provider material, shared snapshot, page local snapshot, and UI all reset to anonymous. |
| Diff scope | `git diff --name-only`; the initial Phase 3.0 prep step was documentation-only. Phase 3.0A/3.0B/3.0C may modify only `tools/product/extension/chrome-live-background.mjs`, `tools/validation/identity/validate-identity-phase2_9.mjs`, `tools/validation/identity/validate-identity-phase2_9-sync.mjs`, and this document. They must not modify page runtime, loader, onboarding UI, Control Hub, First-Run Prompt, Ops Panel, `dev-order`, or add provider SDKs, keys, or network calls unless a later phase explicitly approves it. |

## 15. Step-by-Step Phase 3.0 Implementation Sequence

| Step | Scope | Safety gate |
|---|---|---|
| 3.0A provider adapter skeleton with no network | Extract/shape the mock manager behind the future adapter boundary. Still no external calls. | Phase 2.9 validations pass. No SDK, no secrets, no behavior change. |
| 3.0B provider config boundary, still no secrets committed | Add an inert background-owned provider config boundary and redacted `identity:get-derived-state` diagnostic. Package/install wiring and real provider values remain deferred. | Default remains mock/local. No SDK, network calls, keys, anon keys, service keys, project URLs, or real provider config in runtime objects or bridge responses. |
| 3.0C provider config source/injection design, still no secrets committed | Add an inert config-source resolver and shape validator that define where future provider config may come from without loading real values. | Default remains built-in mock/local. Diagnostics expose only redacted source/status metadata. No SDK, network calls, keys, anon keys, service keys, project URLs, or real provider config. |
| 3.0D provider package/dependency decision, still no SDK install | Decide the future package and bundling strategy for provider integration. Do not install or import provider code. | Dependency decision documented. No package changes, no lockfile changes, no SDK imports, no runtime behavior change. |
| 3.0E build/bundling feasibility check, still no SDK install | Verify whether the current extension build can safely package a background-only provider dependency later. Do not change build behavior. | Feasibility documented. No package changes, no manifest changes, no SDK imports, no runtime behavior change. |
| 3.0F background-only bundling strategy design, still no SDK install | Decide the safest future strategy for packaging provider code only into background-owned output. Do not add a bundler, SDK, manifest change, or runtime behavior change. | Strategy documented. Mock remains default. No package changes, no lockfile changes, no provider imports, no generated output changes. |
| 3.0G build tool decision for background bundle, still no provider SDK | Choose the future build tool for a background-only provider bundle. Do not install the tool, add scripts, add SDK code, or change build behavior. | Tool decision documented. No package changes, no lockfile changes, no build script changes, no provider imports, no generated output changes. |
| 3.0H dummy background bundle harness, no provider SDK | Add a background-only dummy bundle artifact and load it from classic `bg.js` through a safe probe. No provider SDK, provider config, network call, or auth behavior change. | Bundle harness built and isolated. Dummy bundle absent from loader/page outputs and web-accessible resources. Existing identity validators pass. |
| 3.0I generated output isolation hardening | Strengthen generated-output scans so future provider bundles cannot leak into page-facing files or web-accessible resources. No runtime/build behavior change. | Hard-failure validator proves marker/path appears only in `bg.js` and the background bundle, page-facing outputs are clean, and existing identity validators pass. |
| 3.1 request OTP | Background-only provider call for email OTP request. | Page output remains safe and token-free. Local/dev mode still works. |
| 3.2 verify OTP | Background-only provider verify flow and internal session storage. | Raw session never crosses bridge. Derived snapshot reaches verified/profile states only through manager. |
| 3.3 session refresh/signOut | Hydrate on wake, refresh session, sign out, clear provider material, broadcast reset. | Refresh and sign-out validations pass across popup, background, and ChatGPT page. |
| 3.4 profile/workspace creation | Create/load `profiles`, `workspaces`, and `workspace_memberships` with RLS enabled. | `sync_ready` only after safe profile/workspace summaries exist. |
| 3.5 migration | Add explicit local profile/workspace migration and conflict UX. | No silent overwrite. User confirmation required. |
| 3.6 mobile alignment | Align storage and session model with Keychain/SecureStore and same cloud schema. | Tokens never move between extension and mobile app. |
| 3.7 optional magic link/OAuth later | Add magic link or OAuth only after production callback/domain and provider setup are ready. | Does not regress OTP flow or token boundary. |

**Phase 3.0B note:** The background may expose only a redacted provider config status through `identity:get-derived-state`, with safe fields such as provider kind, provider mode, configured boolean, missing field names, and capabilities. The default executable runtime config is mock/local and contains no Supabase URL, anon key, service key, secret, token, raw provider config, or placeholder values.

Future Supabase configuration remains conceptual until a later approved phase: provider kind, project URL, anon key, OTP redirect strategy, magic link disabled for the OTP MVP, and OAuth disabled for the OTP MVP. Those conceptual fields belong in docs/comments or later secure config injection design, not in page scripts, public snapshots, Control Hub, Ops Panel, or current live config returned by `identity:get-derived-state`.

**Phase 3.0C note:** The background may contain an inert config-source resolver whose active source is the built-in mock/local source. The resolver may validate only safe shape metadata and may publish only redacted status through `identity:get-derived-state`, including provider kind, provider mode, configured boolean, config source, missing field names, and capabilities.

Approved future config source options are:

| Future source option | Contract |
|---|---|
| Dev-only local untracked file loaded at build time | Allowed only after an explicit later phase. The file must stay out of git and must be validated by the build boundary. |
| Developer-only extension options page | May set provider config in extension storage later, but only background code may read it. Page scripts, Control Hub, and Ops Panel must not own provider config. |
| CI/build-time secure injection | May inject environment-provided config into a release artifact later. Secrets must remain in CI secret storage and must not be committed. |
| Production packaged public config | May include only approved public Supabase client configuration after review. The service-role key is never packaged. |

What remains forbidden in 3.0C: no real Supabase project URL, no anon key, no service-role key, no provider SDK, no network call, no real OTP call, no magic link, no OAuth, no password login, no token-like placeholder, and no raw config object in bridge diagnostics. The future Supabase shape remains conceptual: provider kind, project URL required later, anon key required later, OTP redirect strategy `none_for_otp_mvp`, magic link disabled, and OAuth disabled.

## Phase 3.0D — Provider Package/Dependency Decision

Phase 3.0D is a decision/specification phase only. It does not install a provider SDK, change package metadata, add imports, add provider configuration, alter runtime behavior, or make network calls.

### Dependency Strategy

The preferred future path is to install `@supabase/supabase-js` in a later explicitly approved phase, then instantiate and use it only inside the extension background `AuthSessionManager` boundary or a dedicated background-owned module. It must not run in page scripts, the `H2O.Identity` page facade, Control Hub, Ops Panel, onboarding UI, first-run prompt, loader, or any userscript surface.

Direct use of `@supabase/supabase-js` is preferred over hand-written provider calls because it centralizes Supabase Auth protocol details, session refresh behavior, and error normalization behind the adapter boundary. The SDK install remains deferred until the build and permission gates below are satisfied.

### Build And Bundling Decision

The current extension build writes generated files directly from `tools/product/extension/*.mjs` and approved Dev Controls helpers into `bg.js`, `loader.js`, and related extension assets. No general dependency bundling path is currently part of the identity background flow.

Future Supabase integration must therefore choose one safe implementation path before adding the SDK:

| Option | Decision |
|---|---|
| Bundle SDK into generated background | Preferred if a later phase adds or verifies a deterministic bundling step that includes provider code only in background-owned output. |
| Dedicated background-owned module | Acceptable if the extension build supports importing or packaging that module without exposing it to page scripts. |
| Vendor SDK manually | Not preferred. High maintenance and review risk. Only acceptable with explicit approval and license/version tracking. |
| Direct unbundled import from package name in MV3 service worker | Not acceptable unless the build proves Chrome can load it from packaged extension files. |

Phase 3.0D does not implement bundling. If the generated-background build cannot safely bundle or package `@supabase/supabase-js`, the next phase must first add and validate that build strategy before any provider install or import.

### Extension CSP And Permissions

Future provider-backed OTP will require explicit extension permission decisions before network calls are added. A later phase must define:

| Area | Required decision before implementation |
|---|---|
| Host permissions | Exact approved provider origins for background-only Auth calls. |
| CSP | Whether the extension CSP needs adjustment for bundled SDK behavior, background fetches, or WebCrypto usage. |
| Network owner | Auth network calls must originate only from background-owned code. |
| Review gate | Built outputs must show no provider code in loader/page-facing files. |

No host permission, CSP, or manifest change is made in Phase 3.0D.

### Runtime And Token Boundary

Even after a future SDK install:

| Boundary | Rule |
|---|---|
| Background only | Supabase SDK initialization and calls may happen only in `AuthSessionManager` or a background-owned adapter module. |
| No page SDK | The SDK must never run in page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, first-run prompt, or loader. |
| Background session owner | Provider session material remains background-only. |
| Public snapshot | Public snapshots, derived state, bridge responses, diagnostics, and ChatGPT page storage remain token-free. |
| Page storage | No provider session or token material may be written to ChatGPT `localStorage`. |

### Dependency Validation Gates

The later phase that installs the SDK must prove:

| Gate | Requirement |
|---|---|
| Package diff | `package.json` and `package-lock.json` changes are intentional, reviewed, and limited to the approved dependency. |
| Import location | SDK imports exist only in the approved background-owned location. |
| Built output | Provider SDK/session code is absent from loader, page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, and first-run prompt. |
| Token checks | No token fields appear in public snapshots, derived state, bridge responses, diagnostics, or page storage. |
| Identity behavior | Existing identity validators still pass, including mock onboarding, `refreshSession` pull, and sign-out reset. |
| Config checks | No service-role key is present anywhere; public client configuration appears only after explicit approval. |

### Decision Alternatives

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| Supabase JS SDK in background | Uses the official client, avoids reimplementing Auth protocol, keeps provider logic inside adapter boundary. | Requires dependency install, bundling/packaging review, permission/CSP review. | Recommended future path. |
| Direct REST calls from background | No SDK bundle; smaller dependency surface. | Higher protocol drift risk, more custom session/refresh/error handling, easier to mishandle edge cases. | Fallback only if SDK bundling is blocked. |
| Custom backend proxy | Keeps extension provider dependency small and can hide provider details. | Adds server ownership, latency, deployment, security, and availability scope. | Not MVP. Revisit only if direct extension provider calls are blocked. |
| Deferred no-SDK adapter | Keeps current mock architecture stable. | Does not deliver real provider auth. | Current state until Phase 3.1 or a build-enablement phase. |

### Final Decision

Phase 3.0D does not install any SDK. A future approved phase may install `@supabase/supabase-js`, but it must be background-only and used exclusively through `AuthSessionManager` or a dedicated background-owned provider adapter module. If the current generated-background build cannot bundle or package that SDK safely, the next phase must first add and validate a bundling strategy. Until then, mock/local remains the default and only executable provider mode.

## Phase 3.0E — Build/Bundling Feasibility Check

Phase 3.0E is a feasibility and architecture-check phase only. It does not install a provider SDK, change build output, change the manifest, add permissions, add CSP rules, add provider configuration, alter runtime behavior, or make network calls.

### Current Build Model

The current extension build is generator-based:

| Area | Current behavior |
|---|---|
| Extension build entry | `tools/product/extension/build-chrome-live-extension.mjs` creates the unpacked extension output directory and writes files directly. |
| Background source | `tools/product/extension/chrome-live-background.mjs` exports `makeChromeLiveBackgroundJs()`, which returns generated service worker source as text. |
| Loader source | `tools/product/extension/chrome-live-loader.mjs` generates the loader/content-script source as text. |
| Manifest source | `tools/product/extension/chrome-live-manifest.mjs` generates a Manifest V3 manifest object. |
| Built background | `build/chrome-ext-dev-controls/bg.js` is generated text, not a normal bundled module entry. |
| Built loader | `build/chrome-ext-dev-controls/loader.js` is generated text and page-facing content-script code. |
| Identity surface | `tools/product/identity/pack-identity.mjs` copies the identity surface and Identity Core script into extension output. |
| Dev workflow | `tools/dev/dev-all.mjs` and `tools/dev/dev-rebuild.mjs` run rebuild/generation steps, not npm dependency bundling. |

The current manifest declares:

```json
"background": {
  "service_worker": "bg.js"
}
```

There is no `type: "module"` field on the background service worker today. The current generated `bg.js` is therefore a classic MV3 service worker script, not an ES module service worker.

### Dependency Support Today

The current build does not safely support importing npm packages directly into `bg.js`.

| Question | Current answer |
|---|---|
| Can generated `bg.js` use bare npm imports today? | No safe path is present. `bg.js` is generated text and the manifest does not mark the service worker as a module. |
| Is there an existing provider dependency bundler? | No. The build writes generated files and copies selected assets/surfaces; it does not bundle npm dependencies into background output. |
| Are package dependencies copied into extension output? | No general `node_modules` copy path exists, and copying all of `node_modules` is forbidden. |
| Would bare module specifiers work in packaged MV3 output? | Not with the current classic service worker and no packaged module resolution/bundling strategy. |
| Can provider code be kept away from page scripts today? | Yes for current mock code, because provider logic lives in generated background. For a future SDK, this remains true only if bundling/package output is constrained to background-owned files. |

### Safe Future SDK Options

| Option | Feasibility | Risk | Maintenance cost | Token-boundary safety | Page exposure risk | Recommendation |
|---|---|---|---|---|---|---|
| A. Bundle SDK into generated/background output using a bundler | Feasible after adding or verifying a deterministic bundling step. | Medium: bundle config and tree-shaking must be reviewed. | Medium. | Strong if bundle target is background-only and validators scan built output. | Low if bundle output is only `bg.js` or background-owned files. | Preferred future path before real provider calls. |
| B. Dedicated background-owned module plus module service worker | Feasible if manifest is changed to `type: "module"` and all extension service worker behavior is revalidated. | Medium-high: service worker module conversion can break imports, globals, or generated assumptions. | Medium. | Strong if module is background-only. | Low if module is not web-accessible and not loaded by content scripts. | Acceptable only after a build-enablement phase validates module service worker loading. |
| C. Copy/vendor provider SDK file into extension output | Technically feasible but undesirable. | High: version drift, license tracking, and review burden. | High. | Medium if copied file is background-only. | Medium if copied file is accidentally exposed as a web-accessible resource. | Not recommended except with explicit approval. |
| D. Direct REST calls from background with no SDK | Feasible without bundling. | Medium-high: custom session, refresh, and error handling can diverge from provider behavior. | Medium-high. | Strong if implemented only in `AuthSessionManager`. | Low if kept in background. | Fallback only if SDK bundling is blocked. |
| E. Custom backend proxy | Feasible as a separate product/service project. | High: adds server security, deployment, latency, and availability concerns. | High. | Strong if extension never handles provider details beyond proxy session design. | Low if extension contract stays derived-state only. | Not MVP; revisit only if direct extension provider integration is blocked. |

### Recommended Path

Do not install any provider SDK until a dedicated background-only packaging path is added or verified. The preferred future path is:

1. Add or verify a bundling/build-enablement step that packages provider code only into background-owned output.
2. Prove the extension still loads and the MV3 service worker starts without import errors.
3. Prove provider SDK code is absent from `loader.js`, page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, and first-run prompt.
4. Only then install and import `@supabase/supabase-js` in an approved background-owned adapter phase.

If bundling proves too risky, direct REST calls from background may be used as a fallback, but that is not the default recommendation because it increases custom Auth protocol and session-management responsibility.

Mock/local remains the only executable provider mode until the build-enablement gate is complete.

### Manifest, CSP, And Permissions Implications

A future provider-backed phase must decide:

| Area | Future decision |
|---|---|
| Service worker type | Keep classic service worker with bundled provider code, or convert to `type: "module"` and validate all background behavior. |
| Host permissions | Add exact provider host permissions only when real provider network calls are approved. |
| CSP | Review whether bundled SDK behavior or WebCrypto usage requires CSP changes. Do not relax CSP without explicit review. |
| Network calls | Keep provider network calls background-owned only. |
| Web-accessible resources | Do not expose provider SDK files or provider config as web-accessible resources. |

No permissions, CSP, host permissions, or manifest behavior are changed in Phase 3.0E.

### Validation Gates Before Future SDK Install

The future SDK install/build-enablement phase must prove:

| Gate | Requirement |
|---|---|
| Package diff | `package.json` and `package-lock.json` changes are intentional and limited to approved dependencies. |
| Background-only SDK | Provider SDK code appears only in background-owned output. |
| No page exposure | Provider SDK code does not appear in `loader.js`, page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, or first-run prompt. |
| No raw credentials | Built output has no raw keys, secrets, tokens, provider session material, or token-like placeholder strings. |
| Identity validators | Existing identity validators still pass, including mock onboarding, `refreshSession` pull, and sign-out reset. |
| Extension load | The unpacked extension loads and the service worker starts without import/module errors. |
| Snapshot boundary | Public snapshots, derived state, bridge responses, diagnostics, and page storage remain token-free. |

### Do-Not-Do Rules For Build Enablement

| Rule |
|---|
| Do not add bare npm imports to generated `bg.js` without bundling or packaged module support. |
| Do not expose provider SDK code in content scripts or `loader.js`. |
| Do not place provider code in page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, or first-run prompt. |
| Do not copy all of `node_modules` into extension output. |
| Do not add host permissions until a real provider phase explicitly approves them. |
| Do not add CSP relaxation without explicit review. |
| Do not use service-role keys anywhere in the extension. |
| Do not make provider SDK files web-accessible. |

### Final Decision

Phase 3.0E does not install any SDK. The current build does not safely support an npm provider SDK today because the background is generated as classic service worker text, there is no dependency bundler in the identity background build path, and package dependencies are not copied or resolved in extension output. The next implementation phase, before any real provider calls, should be build-enablement only: add or verify a background-only bundling/module strategy and prove the extension loads without service worker import errors. Mock/local remains the default and only executable provider mode.

## Phase 3.0F — Background-Only Bundling Strategy Design

Phase 3.0F is a build architecture/design phase only. It does not install a provider SDK, add a bundler, change package metadata, change build output, change the manifest, add provider imports, alter runtime behavior, add host permissions, relax CSP, or make network calls.

### Current Build Data Flow

The current extension build flow remains generator-based:

| Stage | Current data flow |
|---|---|
| Source tools | `tools/product/extension/build-chrome-live-extension.mjs` imports local generator helpers and writes unpacked extension files directly. |
| Generated background | `tools/product/extension/chrome-live-background.mjs` returns text for `bg.js`; the built `bg.js` is a classic MV3 service worker script. |
| Generated loader | `tools/product/extension/chrome-live-loader.mjs` returns text for `loader.js`; the built loader is a content script and page-facing bridge. |
| Manifest | `tools/product/extension/chrome-live-manifest.mjs` emits `background.service_worker: "bg.js"` with no module service worker type today. |
| Copied surfaces/assets | Identity surfaces, icons, popup files, archive workbench files, and bridge pages are copied or generated into the unpacked output. |

There is no current dependency bundling stage in this flow, and package dependencies are not resolved into extension output automatically.

### Build Strategy Options

| Option | Feasibility | Implementation complexity | Compatibility risk | Token-boundary safety | Page/loader leak chance | Maintainability | Recommendation |
|---|---|---|---|---|---|---|---|
| A. Keep generated classic `bg.js` and inject a bundled provider blob/string into it | Feasible only after adding a bundler that can emit a single background-safe artifact. | Medium-high: the build must generate, escape, and insert provider code deterministically. | Medium: large generated text can be hard to debug and may stress service worker review. | Strong if the injected artifact is only inside background output. | Low if validators prove the blob appears only in `bg.js`. | Medium-low because generated text diffs can be noisy. | Acceptable, but not preferred unless a single-file background remains a hard requirement. |
| B. Add a dedicated background provider bundle generated by a bundler, loaded only by `bg.js` | Feasible after a build-enablement phase adds a small background-only bundling harness. | Medium: add one explicit build step and one background-owned artifact. | Medium-low if the loader mechanism is validated in Chrome before SDK install. | Strong because provider code remains outside page-facing files and behind `AuthSessionManager`. | Low if the bundle is not web-accessible and is never referenced by loader/page surfaces. | High: provider code can remain isolated and easier to scan. | Recommended future path. |
| C. Convert the background service worker to `type: "module"` and use module imports | Feasible, but requires manifest and service worker behavior validation. | Medium-high: module conversion changes runtime loading semantics. | Medium-high: classic worker assumptions, globals, and generated source must be rechecked. | Strong if imports are background-only. | Low if modules are not web-accessible or referenced by content scripts. | Medium. | Defer unless option B cannot load safely from a classic worker. |
| D. Vendor/copy provider SDK file into extension output | Technically feasible. | Low initially, high over time. | High: version drift, license tracking, and accidental exposure are easy to miss. | Medium if copied file is background-only, weak if exposed. | Medium-high if copied into general asset paths or web-accessible resources. | Low. | Reject unless explicitly approved as a temporary emergency path. |
| E. Avoid SDK and use direct REST calls from background | Feasible without bundling. | Medium: fewer build changes, more auth protocol code. | Medium: session refresh and edge cases become custom code. | Strong if kept inside background. | Low. | Medium-low because protocol drift must be tracked manually. | Fallback only if SDK bundling remains blocked. |

### Recommended Path

The recommended strategy is option B: add a dedicated background-owned provider bundle/build step in a later build-enablement phase, while keeping the existing generated `bg.js` model for current mock behavior.

The future build should produce a provider adapter artifact that is owned by the background/AuthSessionManager boundary. `bg.js` may load that artifact only if Chrome service worker loading is validated and the artifact is excluded from page-facing outputs. If that cannot be done safely from a classic service worker, only then consider a module service worker conversion with full regression validation.

Do not vendor the whole SDK manually. Do not use direct REST as the default path; reserve it as a fallback if SDK packaging is blocked. Mock/local remains the default and only executable provider mode until build isolation is proven.

### Future Build-Enablement Sequence

| Step | Scope | Safety gate |
|---|---|---|
| 3.0G dependency/build tool decision, still no provider SDK | Choose the bundler/build tool and exact artifact layout. | No package install unless the phase explicitly approves the build tool only. No provider SDK. |
| 3.0H minimal background-only bundling harness, no provider SDK | Add a dummy local background-owned module and package it into the extension output. | Extension loads, service worker starts, dummy module never appears in loader/page outputs. |
| 3.0I generated output isolation verification | Add hard-failure scans for provider-bundle isolation and web-accessible resource boundaries. | Bundle absent from loader, page scripts, public surfaces, and web-accessible resources. |
| 3.0J approved provider SDK install | Install the provider SDK only after the background-only bundle path is proven. | Package diff intentional, provider import exists only in approved background-owned source, no keys or network calls yet unless separately approved. |
| 3.1 request OTP | Implement the first real provider-backed request after SDK/config/permissions approval. | Background-only network path, safe bridge output, token-free public state. |

### Isolation Rules

| Rule |
|---|
| Provider code must exist only in background-owned source and built background-owned output. |
| Provider bundle must not be listed in `web_accessible_resources`. |
| Provider bundle must not be copied into loader, content-script, page-script, popup, Control Hub, Ops Panel, onboarding UI, or first-run prompt paths. |
| Provider bundle must not be imported by `H2O.Identity` or any page facade. |
| Provider bundle must not be imported by Control Hub or Ops Panel. |
| Built output scans must prove provider code is absent from `loader.js`, page scripts, public surfaces, and web-accessible artifacts. |

### Manifest Implications

A later build-enablement phase must decide:

| Area | Decision required later |
|---|---|
| Classic service worker vs module service worker | Prefer keeping the current classic `bg.js` until a background-only bundle loading path is proven. Convert to `type: "module"` only with full regression validation. |
| `importScripts()` | Validate whether a classic MV3 service worker can load the packaged background-only provider artifact safely and consistently. |
| Packaged background-owned file | Define the exact output path and ensure it is not web-accessible or page-referenced. |
| CSP | Review only if the chosen bundling/loading strategy requires a CSP change. No CSP change in 3.0F. |
| Host permissions | Add provider host permissions only in a later real provider phase. No host permission change in 3.0F. |

No manifest behavior changes are made in Phase 3.0F.

### Validation Gates For Future Build Phase

Future build-enablement must prove:

| Gate | Requirement |
|---|---|
| Extension load | The unpacked extension loads in Chrome. |
| Service worker start | The background service worker starts without import, module, CSP, or packaging errors. |
| Output isolation | Provider bundle code is absent from loader, content-script, page-script, popup, Control Hub, Ops Panel, onboarding UI, and first-run prompt outputs. |
| Web-accessible boundary | Provider bundle files are not listed in `web_accessible_resources`. |
| Identity validators | Current identity validators pass, including mock onboarding, `refreshSession` pull, and sign-out reset. |
| Secret checks | Built output contains no keys, secrets, tokens, provider sessions, or token-like placeholder values. |
| Network boundary | No provider network calls are introduced unless a later phase explicitly approves them. |

### Decision Table

| Decision | Outcome | Why |
|---|---|---|
| Recommended strategy | Dedicated background-owned provider bundle generated by a future bundling step. | Best balance of isolation, maintainability, and compatibility with the existing generated `bg.js` model. |
| Rejected: bare npm imports in generated classic `bg.js` | Rejected. | Current classic service worker output has no package resolver or bundling path. |
| Rejected: manual SDK vendoring | Rejected by default. | High drift, review, and exposure risk. |
| Deferred: module service worker conversion | Deferred. | Potentially viable, but broader runtime behavior change than needed for the first build-enablement step. |
| Fallback: direct REST from background | Fallback only. | Avoids bundling but increases custom auth/session protocol responsibility. |

### Do-Not-Do Rules For 3.0F And Build Enablement

| Rule |
|---|
| Do not install a provider SDK before the bundling path is proven. |
| Do not use bare npm imports in generated classic `bg.js`. |
| Do not copy `node_modules` into extension output. |
| Do not expose a provider bundle as a web-accessible resource. |
| Do not place provider code in loader, content scripts, page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, or first-run prompt. |
| Do not convert the service worker to a module without full regression validation. |
| Do not add host permissions or CSP changes early. |
| Do not use direct REST as the default unless SDK bundling is blocked. |
| Do not add keys, secrets, provider config values, token-like strings, or network calls in build-enablement phases. |

### Final Decision

Phase 3.0F does not install any SDK and does not implement bundling. The future recommended build strategy is to add a dedicated background-only provider bundle/build step, then prove service worker loading and output isolation with a dummy local module before installing any provider SDK. The current generated `bg.js` model should remain in place for existing mock behavior. Module service worker conversion is deferred unless the classic service worker cannot safely load a packaged background-owned bundle. Mock/local remains the default and only executable provider mode.

## Phase 3.0G — Build Tool Decision for Background Bundle

Phase 3.0G is a build-tool decision/specification phase only. It does not install a bundler, add build scripts, add a provider SDK, add provider imports, create dummy bundle code, change package metadata, change build output, change the manifest, alter runtime behavior, or make network calls.

### Current Dependency And Build State

| Area | Current state |
|---|---|
| Runtime dependencies | `package.json` currently lists `sharp` only. |
| Development dependencies | `package.json` currently lists `semver` only. |
| Bundler dependency | No `esbuild`, Rollup, Vite, Webpack, or equivalent bundler is installed or configured for the extension background. |
| Extension build path | `tools/product/extension/build-chrome-live-extension.mjs` writes generated `manifest.json`, `bg.js`, `loader.js`, popup files, surfaces, and assets directly into the unpacked output. |
| Dependency bundling | No dependency bundling path exists in the current extension build. Package dependencies are not resolved or copied into extension output. |
| Background format | `chrome-live-background.mjs` returns text for a classic MV3 `bg.js`; the manifest does not currently mark the background service worker as a module. |

The current generated `bg.js` cannot safely use bare npm imports because it is emitted as classic service worker text with no package resolver, no bundler, no copied dependency graph, and no module-service-worker manifest configuration.

### Build Tool Options

| Option | Fit for small background-only bundle | MV3 compatibility | Output control | Dependency footprint | Config complexity | Sourcemap/debuggability | Page/loader leak risk | Recommendation |
|---|---|---|---|---|---|---|---|---|
| A. `esbuild` | Strong fit for a narrow provider adapter bundle. | Good when output is targeted to browser/worker-compatible JavaScript and validated in Chrome. | Strong: can emit a single file with explicit entry/output paths. | Small relative to full app bundlers. | Low: Node API or CLI can fit the current Node toolchain. | Good enough for this isolated artifact; sourcemaps can be enabled later if approved. | Low if the build writes only to a background-owned path and scans outputs. | Recommended future tool. |
| B. Rollup | Good for library-style ESM bundles. | Good with careful plugin/config setup. | Strong. | Medium: plugins may be needed for dependency compatibility. | Medium. | Good. | Low if output is constrained. | Acceptable fallback if `esbuild` cannot bundle the provider dependency correctly. |
| C. Vite | Designed around app/dev-server workflows more than a single extension background artifact. | Possible, but adds conventions not needed here. | Medium: can be controlled, but the abstraction is broader than needed. | Medium-high. | Medium-high for this narrow use. | Good. | Medium if additional outputs/assets are introduced accidentally. | Not recommended for this targeted background bundle. |
| D. Webpack | Mature and flexible. | Possible with careful worker target configuration. | Strong but verbose. | High. | High. | Good, but config-heavy. | Low if configured correctly, higher review burden. | Not recommended unless simpler tools fail. |
| E. Node-only custom concatenation/copy | Smallest apparent dependency footprint. | Only safe for trivial local code; weak for real dependency graphs. | Low for npm dependencies. | None. | Low initially, high once dependencies appear. | Poor. | Medium: copied files can drift into output paths without dependency graph awareness. | Reject for provider SDK packaging. |
| F. Stay no-SDK/direct REST fallback | Avoids bundling entirely. | Feasible from background if host permissions are later approved. | Strong because no bundle exists. | None for bundling. | Medium because Auth/session protocol code moves into H2O. | Depends on custom code. | Low if background-only. | Fallback only, not the default provider SDK path. |

### Recommended Tool

The recommended future build tool is `esbuild`.

Reasons:

| Reason | Why it matters for H2O |
|---|---|
| Small scope fit | The need is one background-owned provider adapter artifact, not a full app bundling system. |
| Fast and simple | The existing extension build is Node-based; `esbuild` can be called from a small Node build helper later. |
| ESM/CJS handling | It can bundle common dependency formats into a packaged extension file. |
| Single-file output | A single background-owned output is easier to scan, load, and keep away from page-facing files. |
| Worker/browser target | A later phase can target worker-compatible browser output and validate it in Chrome. |
| Lower config burden | It is simpler than Rollup, Webpack, or Vite for this narrow build artifact. |

Rollup remains the best fallback if the provider dependency needs more precise ESM/library bundling behavior than `esbuild` provides. Webpack and Vite are heavier than needed for this phase's intended artifact.

### Future Artifact Design

The future artifact shape should be explicit and background-owned:

| Artifact area | Future contract |
|---|---|
| Source entry | A dedicated provider adapter entry such as `tools/product/identity/identity-provider-adapter.entry.mjs` or an equivalent background-owned path. |
| Output path | A packaged output such as `build/chrome-ext-dev-controls/provider/identity-provider-adapter.js`, mirrored for lean builds if needed. |
| Ownership | Background/AuthSessionManager only. |
| Web accessibility | The provider artifact must not be listed in `web_accessible_resources`. |
| Loader/page references | `loader.js`, page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, and first-run prompt must not reference or import it. |
| Current phase | Phase 3.0G creates no source entry, output file, bundler config, or build script. |

### Future Loading Strategy

| Loading strategy | Fit | Decision |
|---|---|---|
| Classic service worker plus `importScripts()` for a packaged background-owned bundle | Best first test because it preserves the current classic `bg.js` manifest/runtime model while adding one isolated load path. | Test first in a later dummy-harness phase. |
| Module service worker importing a module bundle | Viable but broader because it changes background service worker loading semantics and manifest behavior. | Keep as fallback if classic loading fails. |
| Full `bg.js` bundle | Could work, but it would replace the current generated background model and increase regression scope. | Defer unless isolated provider bundle loading is not viable. |

The first implementation test should be classic service worker plus `importScripts()` loading a dummy packaged background-owned bundle. That minimizes manifest/runtime churn while proving isolation.

### Future Build-Enablement Phase Proposal

Next phase should be:

`Identity Phase 3.0H — Dummy Background Bundle Harness, No Provider SDK`

Proposed 3.0H scope:

| Scope item | Contract |
|---|---|
| Bundler install | Install or configure the chosen bundler only if explicitly approved for 3.0H. |
| Dummy module | Create a local dummy background-owned module with no provider SDK, no provider config, no network, and no secrets. |
| Build output | Build the dummy module into a background-owned extension output path. |
| Background load | Load it from `bg.js` safely using the selected loading strategy. |
| Chrome validation | Verify the extension loads and the service worker starts without import errors. |
| Isolation validation | Verify the dummy bundle is absent from loader/page outputs and is not web-accessible. |
| Identity behavior | Existing mock identity validators must still pass. |

Phase 3.0H must not install a provider SDK, add provider config, add network calls, or change the public identity API.

### Validation Gates For Future Build-Tool Implementation

Future 3.0H must prove:

| Gate | Requirement |
|---|---|
| Package diff | Package changes, if any, include only the approved bundler/build tool. |
| Background-owned output | The generated dummy/provider bundle exists only in the intended background-owned output path. |
| Web-accessible boundary | The bundle is not listed in `web_accessible_resources`. |
| Page output isolation | `loader.js`, page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, and first-run prompt outputs do not contain bundle code. |
| Chrome load | The unpacked extension loads in Chrome. |
| Service worker start | The service worker starts without import, CSP, or packaged-file errors. |
| Identity validators | Existing identity validators pass with mock/local behavior unchanged. |
| Security checks | No provider SDK, keys, secrets, provider config values, token-like strings, or network calls are added. |

### Rejected And Deferred Choices

| Choice | Status | Reason |
|---|---|---|
| Rollup | Deferred fallback. | Use only if `esbuild` cannot satisfy dependency packaging requirements. |
| Vite | Rejected for this narrow artifact. | Adds app-oriented workflow and output complexity that the extension does not need. |
| Webpack | Deferred fallback. | Powerful but heavier and more configuration-heavy than necessary. |
| Node-only concatenation/copy | Rejected. | Cannot safely handle real npm dependency graphs and increases drift/exposure risk. |
| Vendor/copy `node_modules` | Rejected. | Too broad, hard to review, and easy to expose accidentally. |
| Module service worker conversion | Deferred. | Broader runtime/manifest change; try classic worker loading first. |
| Direct REST default | Rejected as default. | It bypasses SDK bundling but increases custom Auth/session protocol responsibility. |
| Provider SDK install before dummy harness | Rejected. | The isolation and loading path must be proven first. |

### Final Decision

Phase 3.0G installs nothing. The recommended future build tool for a background-owned provider bundle is `esbuild`, used only in a later approved build-enablement phase. The next phase should be a dummy background bundle harness, not provider integration. Mock/local remains the default and only executable provider mode.

## Phase 3.0H — Dummy Background Bundle Harness, No Provider SDK

Phase 3.0H is a build-enablement phase. It proves the extension can package and load a background-owned artifact before any provider SDK, real provider configuration, host permission, CSP, network call, or OTP behavior is added.

### Implemented Harness Shape

| Area | Phase 3.0H contract |
|---|---|
| Build tool | `esbuild` may be added as the approved build-only dependency. No provider SDK is installed. |
| Dummy source | A local background-owned entry such as `tools/product/identity/identity-provider-dummy.entry.mjs`. |
| Build helper | A small helper such as `tools/product/identity/build-identity-provider-bundle.mjs` builds only the dummy entry. |
| Output | Built output lives under an extension background-owned path such as `provider/identity-provider-dummy.js` for controls and lean builds. |
| Background load | Classic `bg.js` loads the packaged dummy artifact with `importScripts()` behind a safe optional probe. |
| Diagnostic | `identity:get-derived-state` may include `providerConfigStatus.bundleProbe` with safe booleans and labels only. Public snapshots stay unchanged. |

The dummy bundle contains no provider code, provider SDK import, provider config, keys, secrets, token-like values, auth calls, or network calls. It sets only a harmless background global marker used by the service worker probe.

### Isolation Proof

Phase 3.0H must prove:

| Gate | Requirement |
|---|---|
| Background-owned output | The dummy bundle exists only in the generated extension output path intended for background loading. |
| Loader isolation | `loader.js` does not contain the dummy bundle marker or path. |
| Page isolation | `H2O.Identity`, onboarding UI, Control Hub, Ops Panel, first-run prompt, and page scripts do not import or reference the dummy bundle. |
| Web-accessible boundary | The dummy bundle is not listed in `web_accessible_resources`. |
| Safe diagnostics | `bundleProbe` exposes only expected/loaded/kind/phase/error-code style metadata. No raw source, raw path, config value, token, or session value is exposed. |
| Security scan | The dummy bundle and built page-facing outputs contain no provider SDK string, provider URL, key, secret, token field, JWT-like string, provider auth call, or network call. |
| Behavior preservation | Mock/local identity behavior remains unchanged; existing identity validators still pass. |

### Validation Additions

Phase 3.0H should add a hard-failure validator, for example `tools/validation/identity/validate-identity-background-bundle.mjs`, that checks:

| Check | Requirement |
|---|---|
| Package scope | Package changes are limited to the approved build tool if it is installed. |
| Output existence | Controls and lean extension outputs include the dummy bundle. |
| Background reference | Built `bg.js` references and safely probes the dummy bundle. |
| Not web-accessible | Manifests do not expose the dummy bundle as a web-accessible resource. |
| Not page-facing | Loader, page scripts, `H2O.Identity`, onboarding UI, Control Hub, and first-run prompt do not contain the dummy marker or bundle path. |
| No provider content | No provider SDK, real provider config, token fields, keys, secrets, JWT-like strings, auth calls, or network calls appear in the dummy bundle. |
| Syntax | Generated `bg.js`, `loader.js`, and the dummy bundle parse. |

### Final Decision

Phase 3.0H adds only a dummy background bundle harness. The harness is provider-free, network-free, token-free, and behavior-neutral. It validates the future background-only packaging path before any Supabase SDK install or real provider calls. Mock/local remains the default and only executable identity mode.

## Phase 3.0I — Generated Output Isolation Hardening

Phase 3.0I is a validation/build-hardening phase. It does not install provider SDKs, add real provider config, add keys, change runtime behavior, change manifest behavior, alter loader behavior, or make network calls.

### Hardened Isolation Contract

| Area | Contract |
|---|---|
| Allowed marker/path locations | The dummy bundle marker and path may appear only in built `bg.js` and `provider/identity-provider-dummy.js`. |
| Forbidden page-facing locations | The marker/path must not appear in `loader.js`, `folder-bridge-page.js`, popup files, built `scripts/*`, built `surfaces/*`, identity surfaces, Control Hub, Ops Panel, onboarding UI, or first-run prompt output. |
| Web-accessible resources | No `provider/` path, dummy bundle path, dummy bundle name, or dummy marker may be listed in `manifest.web_accessible_resources`. |
| Dummy bundle behavior | The dummy bundle may only set the safe background probe marker. It must not use `chrome.*`, storage APIs, DOM globals, `H2O.`, `window.H2O`, network APIs, provider auth calls, provider SDK strings, provider URLs, token fields, secrets, or JWT-like values. |
| Safe marker exception | The exact marker `H2O_IDENTITY_PROVIDER_BUNDLE_PROBE` is allowed. Page-facing object usage such as `H2O.`, `window.H2O`, or non-marker `globalThis.H2O...` remains forbidden. |
| Syntax gate | Built `bg.js`, `loader.js`, `folder-bridge-page.js`, popup JS when present, identity surface JS, built Identity Core, and the dummy bundle must parse. |

### Future SDK Bundle Gates

Any later real provider bundle must pass the same isolation model before Phase 3.1 provider calls begin:

| Gate | Requirement |
|---|---|
| Background-only output | Provider bundle code appears only in background-owned output and the background loader reference. |
| No page exposure | Provider bundle marker, package names, provider client code, and provider paths are absent from loader, page scripts, surfaces, popup, Control Hub, Ops Panel, onboarding UI, and first-run prompt output. |
| Not web-accessible | Provider bundle files are not web-accessible resources. |
| Token boundary | Public snapshots, derived state, page scripts, diagnostics, and ChatGPT storage remain token-free. |
| No accidental network path | Network-capable provider code must not enter page-facing outputs. Real network calls remain blocked until the explicit provider phase approves them. |

This protects the page/runtime token boundary by making provider-code isolation a generated-output invariant, not just a source-code convention.

### Final Decision

Phase 3.0I hardens validation only. It proves the current dummy bundle is confined to background-owned output and creates a repeatable gate for future provider bundle work. Mock/local remains the default and only executable identity mode.

## Phase 3.0J — Provider SDK Install Gate Plan

Phase 3.0J is an install-gate specification only. It does not install a provider SDK, add provider configuration, change package files, change runtime behavior, change manifest behavior, alter loader behavior, or make network calls.

### Install Prerequisites

Before a provider SDK install phase may begin, all of these gates must already be true:

| Gate | Requirement |
|---|---|
| Dummy harness | The Phase 3.0H background-only dummy bundle harness exists and is wired into controls and lean builds. |
| Isolation validator | The Phase 3.0I generated-output isolation validator passes for both extension variants. |
| Service worker load | Browser validation confirms the service worker loads the dummy bundle probe successfully. |
| Mock behavior | Mock onboarding, popup/background/page sync, `refreshSession()`, sign-out reset, and first-run prompt readiness still work. |
| Package policy | The allowed future package diff is explicit and limited before any install begins. |
| Page boundary | No page-facing provider bundle, provider package code, provider config, key, token, session, or credential exposure exists. |
| Config boundary | No real provider URL, key, service credential, host permission, CSP change, or network path is present. |

### Approved Future SDK-Install Scope

A future SDK-install phase may modify only these areas unless a later phase explicitly expands scope:

| Area | Allowed future change |
|---|---|
| Package files | `package.json` and `package-lock.json` may change only for the approved provider dependency and its dependency tree. |
| Provider adapter source | A background-owned provider adapter entry/source file may import the SDK for bundling. |
| Provider bundle build helper | The provider bundle build helper may be adjusted only as needed to bundle the approved dependency. |
| Provider bundle validator | The isolation validator may be updated to recognize the approved background-only SDK bundle while preserving page/output gates. |
| Prep documentation | This prep document may be updated with install results and follow-up gates. |
| Background AuthSessionManager | `chrome-live-background.mjs` may be touched only if the approved phase adds a no-network provider-adapter stub behind the existing background-owned boundary. |

The future SDK-install phase must not modify loader, `H2O.Identity` page facade, onboarding UI, Control Hub, Ops Panel, First-Run Prompt, MiniMap, Library, Folders, Categories, Tags, or Labels.

### Package Diff Gate

The future install phase must prove:

| Gate | Requirement |
|---|---|
| Single provider dependency | `@supabase/supabase-js` is the only new provider dependency. |
| Explainable lockfile | `package-lock.json` changes are limited to the dependency tree required by that package. |
| Build-tool stability | `esbuild` remains the only build-tool dependency unless another build tool is explicitly approved. |
| No unrelated package churn | No unrelated package updates, script changes, package metadata churn, or dependency removals are included. |
| No install side effects | No postinstall hook, generated runtime file, config file, key file, or unrelated artifact is introduced by the install. |

### Import Location Gate

The provider SDK import may appear only in:

| Location | Rule |
|---|---|
| Background-owned provider adapter source | Allowed, because it is the source entry for the provider bundle. |
| Generated background-owned provider bundle | Allowed, because it is not page-facing and is not web-accessible. |

The provider SDK import or bundled SDK code must not appear in generated classic `bg.js` as a bare package import, `loader.js`, page scripts, `H2O.Identity`, onboarding surface, Control Hub, Ops Panel, First-Run Prompt, popup files, built `scripts/*`, or built `surfaces/*` outside the provider bundle.

### Generated Output Isolation Gate

The future SDK bundle must pass these output gates:

| Gate | Requirement |
|---|---|
| Background-only code | Provider SDK code appears only in the provider bundle and the optional `bg.js` load/probe reference. |
| Not web-accessible | Provider bundle files are not listed in `manifest.web_accessible_resources`. |
| Page outputs clean | Loader, page scripts, identity surfaces, popup files, Control Hub, Ops Panel, onboarding UI, and first-run prompt output do not contain provider package names, provider bundle paths, SDK client code, or provider-session shapes. |
| Public state safe | Public snapshots, derived state, diagnostics, page scripts, and ChatGPT storage remain token-free and session-free. |
| Identity behavior intact | Existing mock identity validators still pass after the SDK is installed and bundled. |

### No-Config and No-Network Gate

The first SDK-install phase must still avoid all real provider behavior:

| Forbidden in SDK-install phase |
|---|
| No provider project URL. |
| No public provider key. |
| No service-role or service credential. |
| No host permission change. |
| No CSP change. |
| No network call. |
| No provider client creation call. |
| No email OTP request call. |
| No email OTP verification call. |
| No real provider config injection. |

The only approved purpose of that phase is to prove package install, background-only import, bundle generation, service-worker load, and output isolation.

### Future Staged Sequence

| Phase | Purpose |
|---|---|
| 3.0K | Install `@supabase/supabase-js` into the background provider bundle path only. No config, no provider client creation, no network. |
| 3.0L | Add a provider adapter import smoke test behind the background bundle probe. No client creation, no network. |
| 3.0M | Review provider config and secure injection mechanics. No real values committed. |
| 3.1 | Request email OTP only after config, permissions, network scope, and product UX are explicitly approved. |

### Validation Command Set for Future SDK Install

The future SDK-install phase must run and report:

| Validation |
|---|
| The exact package install or package update command. |
| `node tools/product/extension/build-chrome-live-extension.mjs` |
| `H2O_EXT_DEV_VARIANT=lean H2O_EXT_OUT_DIR=build/chrome-ext-dev-lean node tools/product/extension/build-chrome-live-extension.mjs` |
| `node tools/dev-controls/ops-panel/make-chrome-ops-panel-extension.mjs` |
| `node tools/validation/identity/validate-identity-background-bundle.mjs` |
| `node tools/validation/identity/validate-identity-phase2_9.mjs` |
| `node tools/validation/identity/validate-identity-phase2_9-sync.mjs` |
| `node tools/validation/onboarding/validate-onboarding-open.mjs` |
| Package diff checks proving only the approved dependency tree changed. |
| Generated output scans proving provider code remains background-only. |

### Manual Validation Gate for Future SDK Install

Before any real provider work proceeds, manual validation must confirm:

| Manual check |
|---|
| The extension loads. |
| The service worker starts without import or bundle errors. |
| The background bundle probe reports loaded. |
| Sign-out still returns the identity state to anonymous/local. |
| Mock onboarding still completes. |
| `refreshSession()` still reaches a ready mock state after onboarding. |
| The first-run prompt hides when identity is ready. |

### Do-Not-Do Rules for SDK Install

| Rule |
|---|
| Do not add the SDK directly to generated classic `bg.js` via a bare package import. |
| Do not expose the provider bundle as web-accessible. |
| Do not include provider SDK code in loader or page scripts. |
| Do not add provider config in the same phase as SDK install unless explicitly approved. |
| Do not add network calls in the same phase as SDK install. |
| Do not add a service-role key or service credential anywhere in the extension. |
| Do not modify unrelated systems. |
| Do not proceed to real OTP until SDK import isolation is proven. |

### Final Decision

Phase 3.0J installs nothing. SDK install is not approved yet. If this gate is accepted, the next implementation phase should be SDK install/import-isolation only, with no real provider config and no network behavior. Mock/local remains the default and only executable identity mode.

## Phase 3.0K — Supabase SDK Background Bundle Import Gate

Phase 3.0K installs `@supabase/supabase-js` only to prove the SDK can be packaged into the background-owned provider bundle. It does not add provider configuration, create a provider client, call auth/session APIs, add host permissions, change CSP, change manifest behavior, change loader behavior, alter public identity APIs, or make network calls.

### Implemented Gate

| Area | Phase 3.0K decision |
|---|---|
| Dependency | `@supabase/supabase-js` is the only new direct provider dependency. |
| Build location | The SDK is imported only by the background-owned provider bundle entry. |
| Bundle output | SDK code is allowed only inside `provider/identity-provider-dummy.js`, which remains background-owned and not web-accessible. |
| Background load | Existing `bg.js` loading remains unchanged: it loads the provider bundle via the existing optional `importScripts()` probe path. |
| Public state | Public `H2O.Identity` snapshots stay unchanged and token-free. |
| Diagnostic | `providerConfigStatus.bundleProbe` may expose only safe booleans and generic labels such as `provider-sdk`; it must not expose raw module objects, function bodies, provider config, URLs, keys, tokens, sessions, or provider responses. |

### Probe Contract

The bundle probe reports only import-isolation metadata:

| Field | Required value |
|---|---|
| `kind` | `supabase-sdk-import-probe` |
| `phase` | `3.0K` |
| `surface` | `background` |
| `sdkImport.importOk` | `true` when the package namespace imports successfully. |
| `sdkImport.clientCreated` | `false` |
| `sdkImport.networkEnabled` | `false` |

The probe does not call `createClient()`, `signInWithOtp()`, `verifyOtp()`, `getSession()`, `refreshSession()`, or any network API.

### Validation Rules

| Gate | Requirement |
|---|---|
| Package scope | `package.json` may list only `@supabase/supabase-js` as the direct provider dependency. |
| Lockfile scope | `package-lock.json` may contain the provider dependency tree required by the SDK. |
| Source safety | H2O-owned provider entry source may import the SDK but must not call provider client/auth/session/network methods or contain provider config values. |
| Output isolation | SDK internals may appear only inside the isolated background-owned provider bundle and package dependency files. |
| Page outputs | Loader, page scripts, identity surfaces, popup files, Control Hub, Ops Panel, onboarding UI, First-Run Prompt, built `scripts/*`, and built `surfaces/*` must not contain provider SDK package names, provider bundle paths, provider-session fields, keys, tokens, or provider responses. |
| Web-accessible resources | The provider bundle and provider directory remain absent from `manifest.web_accessible_resources`. |
| Mock behavior | Mock/local identity remains the default and all existing identity validators must continue to pass. |

### Final Decision

Phase 3.0K proves SDK import and bundling isolation only. It starts no real provider behavior. The next phase must remain a no-network adapter/import smoke test or secure config review; real OTP is still blocked until config, permissions, host access, network scope, and UX are explicitly approved. Mock/local remains the default and only executable identity mode.

## Phase 3.0L — Provider Adapter Import Smoke Test

Phase 3.0L upgrades the background-owned provider bundle probe from SDK namespace import proof to provider adapter-shape smoke proof. It does not add provider configuration, create a provider client, call auth/session APIs, add host permissions, change CSP, change manifest behavior, change loader behavior, alter public identity APIs, make network calls, or implement OTP.

### Adapter Smoke Contract

| Area | Phase 3.0L decision |
|---|---|
| Adapter layer | The provider bundle exposes a safe adapter metadata object only. |
| Provider kind | Adapter metadata may identify the future provider kind as `supabase`. |
| Client factory check | The bundle may check `typeof ProviderSdk.createClient === "function"` as metadata only. |
| Client creation | `clientCreated` must remain `false`; `createClient()` must not be called. |
| Config | `configPresent` must remain `false`; no URL, key, token, session, credential, or provider response is present. |
| Network | `networkEnabled` must remain `false`; no network API is called by H2O-owned provider code. |
| Planned operations | Adapter metadata may list planned operation names only: request email OTP, verify email OTP, refresh session, and sign out. |
| Public state | Public `H2O.Identity` snapshots stay unchanged and token-free. |

### Safe Diagnostic Shape

`providerConfigStatus.bundleProbe` may expose only sanitized adapter smoke metadata:

| Field | Required value |
|---|---|
| `kind` | `supabase-adapter-import-smoke` |
| `phase` | `3.0L` |
| `adapter.adapterLoaded` | `true` |
| `adapter.clientFactoryPresent` | `true` when the SDK export is present. |
| `adapter.clientCreated` | `false` |
| `adapter.configPresent` | `false` |
| `adapter.networkEnabled` | `false` |
| `sdkImport.importOk` | `true` |

Diagnostics must not expose raw SDK modules, function bodies, raw package names, provider config, URLs, keys, tokens, sessions, credentials, provider responses, or provider client instances.

### Validation Rules

| Gate | Requirement |
|---|---|
| Source safety | H2O-owned provider source may import the SDK and inspect the client factory type, but must not call provider client/auth/session/network methods. |
| Adapter metadata safety | Adapter metadata contains only booleans, the approved provider kind, and approved planned operation strings. |
| Output isolation | SDK internals may appear only inside the isolated background-owned provider bundle and package dependency files. |
| Page outputs | Loader, page scripts, identity surfaces, popup files, Control Hub, Ops Panel, onboarding UI, First-Run Prompt, built `scripts/*`, and built `surfaces/*` must not contain provider SDK package names, provider bundle paths, provider-session fields, keys, tokens, or provider responses. |
| Web-accessible resources | The provider bundle and provider directory remain absent from `manifest.web_accessible_resources`. |
| Mock behavior | Mock/local identity remains the default and all existing identity validators must continue to pass. |

### Final Decision

Phase 3.0L proves the future provider adapter boundary can load and report safe adapter-shape metadata. It still starts no real provider behavior. The next phase should be secure provider config injection review or another no-network adapter phase; real OTP remains blocked until config, permissions, host access, network scope, and UX are explicitly approved. Mock/local remains the default and only executable identity mode.

## Phase 3.0M — Provider Config Secure Injection Review

Phase 3.0M is a secure-config architecture and review phase. It adds no real provider config, no project URL, no anon key, no service-role key, no provider client creation, no host permissions, no CSP changes, no network calls, and no OTP behavior.

### Config Source Options

| Option | Suitability | Security risk | Developer ergonomics | Production readiness | Extension risk | Recommendation |
|---|---|---|---|---|---|---|
| Build-time environment injection from CI/secrets | Strong for production packaged public config after approval. | Medium: injected values can leak if build outputs are not scanned. | Good once CI is configured; poor for quick local iteration. | Strong when paired with release gates. | Low if injected only into background-owned config and scanned out of page outputs. | Recommended for production public URL + anon key only. |
| Local untracked dev config file | Strong for local/dev and staging trials. | Medium: accidental commit risk unless ignored and validated. | Good for developers. | Weak for production packaging. | Low if read only by background-owned config code later. | Recommended for dev/staging in a later phase. |
| Developer-only extension options/storage | Useful for controlled dev workflows and QA. | Medium: local storage can be inspected and must stay background-owned. | Good once an options surface exists. | Limited unless paired with managed deployment policy. | Medium if UI ownership drifts into Control Hub/Ops Panel. | Acceptable later for developer-only workflows. |
| Runtime remote config endpoint | Useful for central rotation, but adds bootstrap trust and network dependency. | High: endpoint compromise or transport mistakes can affect auth config. | Good for ops, worse for offline/dev. | Possible later with signing/pinning review. | High until trust model and host permissions are approved. | Deferred. |
| Hardcoded config in repo | Simple but unsafe for review and reuse. | High: values become durable repo history. | Easy initially, bad long-term. | Poor. | High: likely to leak into generated outputs. | Rejected. |
| Service-role key in extension | Not suitable. | Critical: service credentials in a browser extension are extractable. | N/A. | Never acceptable. | Critical. | Permanently rejected. |

### Recommended Staged Strategy

Dev and staging config should come from a local untracked config source or developer-only extension storage in a later approved phase. Production config should come from explicit build-time injection of public Supabase URL and anon key only, after release gates are defined.

The background `AuthSessionManager` remains the only provider-config reader. Page scripts, `H2O.Identity`, Control Hub, Ops Panel, public snapshots, generated page-facing outputs, and web-accessible resources must never receive raw provider config.

`providerConfigStatus` may expose only redacted readiness metadata:

| Allowed diagnostic field |
|---|
| `providerKind` |
| `providerMode` |
| `providerConfigured` |
| `configSource` |
| `missingFields` |
| `capabilities` |
| `bundleProbe` |

It must never expose project URL, anon key, service-role key, raw config objects, tokens, sessions, credentials, provider responses, or provider client instances.

### Conceptual Future Config Shape

Future Supabase config remains conceptual until an explicitly approved config phase:

| Field | Future meaning |
|---|---|
| `providerKind` | `supabase` |
| `projectUrl` | Required later; never committed in Phase 3.0M. |
| `anonKey` | Required later; public client key, but still background-only and not exposed to page scripts. |
| `otpRedirectStrategy` | `none_for_otp_mvp` |
| `useMagicLink` | `false` |
| `useOAuth` | `false` |

Phase 3.0M does not add executable config, placeholder values that look real, key files, environment wiring, or config storage.

### Future Config Validation Rules

Future config validation must:

| Rule |
|---|
| Reject missing `projectUrl` or `anonKey` when provider mode is enabled. |
| Reject service-role-like keys and any service credential. |
| Reject non-HTTPS project URLs. |
| Restrict the allowed Supabase host pattern in the real-config phase. |
| Reject raw token/session fields and provider response shapes. |
| Reject raw config exposure through bridge responses, page scripts, snapshots, diagnostics, web-accessible resources, and generated page outputs. |
| Report only redacted readiness state through `providerConfigStatus`. |
| Keep mock/local mode available when provider config is absent or invalid. |

### Future Phase Sequence

| Phase | Purpose |
|---|---|
| 3.0N | Add a config schema/validator stub with no real values. |
| 3.0O | Add a dev-only injection harness using empty or intentionally invalid config only. |
| 3.0P | Add real dev config injection through a local untracked file or secure environment only; still no network unless separately approved. |
| 3.1 | Request OTP only after config, permissions, host access, CSP/network scope, and UX are approved. |

### Validation Gates for Future Config Phases

Future config phases must prove:

| Gate |
|---|
| No real config is committed. |
| No service-role key exists anywhere. |
| No raw config appears in loader, page scripts, public snapshots, web-accessible resources, Control Hub, Ops Panel, onboarding UI, or First-Run Prompt. |
| No host permissions or CSP changes are added before the approved network phase. |
| No network calls occur until explicitly approved. |
| Existing identity validators continue to pass. |

### Do-Not-Do Rules

| Rule |
|---|
| Do not commit Supabase URL or anon key until a real-config phase explicitly approves it. |
| Never commit or package a service-role key. |
| Do not expose provider config to page scripts. |
| Do not add config and network behavior in the same phase. |
| Do not call `createClient()` in the config review phase. |
| Do not start OTP until config, permissions, host access, network scope, and UX are approved. |

### Final Decision

Phase 3.0M adds no config and no runtime behavior. It documents the secure config injection strategy only. The next phase should be a config schema/validator stub with no real values. Mock/local remains the default and only executable identity mode.

## Phase 3.0N — Config Schema/Validator Stub

Phase 3.0N adds a background-owned config schema and validator stub only. It does not add real Supabase config, project URL, anon key, service-role key, provider client creation, host permissions, CSP changes, network calls, or OTP behavior. Mock/local remains the default and only executable provider mode.

### Runtime Schema Stub

The background config boundary owns the schema version and validation result. The executable default remains:

| Field | Phase 3.0N value |
|---|---|
| `schemaVersion` | `3.0N` |
| `providerKind` | `mock` |
| `providerMode` | `local_dev` |
| `providerConfigured` | `true` |
| `configSource` | `built_in_mock` |
| `valid` | `true` |
| `validationState` | `valid` |
| `missingFields` | Empty list |
| `errorCodes` | Empty list |

The future provider-backed schema is represented only through generic validation labels. Missing provider-backed config reports `provider_project` and `public_client`; elevated/server-style access is rejected with a generic error code. No raw future config values or field values are emitted.

### Safe Redacted Status

`identity:get-derived-state` may expose these safe fields through `providerConfigStatus`:

| Allowed field |
|---|
| `providerKind` |
| `providerMode` |
| `providerConfigured` |
| `configSource` |
| `schemaVersion` |
| `valid` |
| `validationState` |
| `missingFields` |
| `errorCodes` |
| `capabilities` |
| `bundleProbe` |

`providerConfigStatus` must never expose project URL, anon key, service-role key, raw config objects, tokens, sessions, credentials, provider responses, provider client instances, or raw SDK/module objects. Public `H2O.Identity` snapshots remain unchanged and do not include provider config status.

### Validation Behavior

| Input class | Expected validation result |
|---|---|
| Mock/local built-in config | Valid, configured, no missing fields, no error codes. |
| Future provider-backed config with no values | Invalid, not configured, `missing_config`, generic missing fields only. |
| Future provider-backed config with elevated/server-style access | Invalid, rejected with a generic elevated-access error code. |

The validator stub is intentionally conservative: absent or invalid provider-backed config does not switch runtime behavior away from the mock adapter. `identityAuthManager_getProviderAdapter()` must continue to resolve to the mock provider until a later explicitly approved config and network phase.

### Future Phase Sequence

| Phase | Purpose |
|---|---|
| 3.0O | Add a dev-only injection harness with empty or intentionally invalid config only. |
| 3.0P | Add real dev config injection through an untracked local file or secure environment only; still no network unless separately approved. |
| 3.1 | Request OTP only after config, permissions, host access, CSP/network scope, and UX are approved. |

### Phase 3.0N Gates

| Gate |
|---|
| No real config values are committed. |
| No service-role key exists in executable code or generated outputs. |
| No raw provider config appears in loader, page scripts, public snapshots, web-accessible resources, Control Hub, Ops Panel, onboarding UI, or First-Run Prompt. |
| No provider client is created. |
| No provider auth/session method is called. |
| No network API is added for identity/provider config. |
| Existing identity validators and background bundle isolation checks pass. |

### Final Decision

Phase 3.0N adds the config schema/validator stub and redacted status metadata only. It adds no real values, no client creation, no network behavior, and no provider mode switch. The next phase should be a dev-only injection harness using empty or invalid config only, not real config or OTP.

## Phase 3.0O — Dev-Only Config Injection Harness With Empty/Invalid Config Only

Phase 3.0O adds a background-owned dev-only harness that can exercise provider-backed config validation without real values. It does not add a project URL, anon key, service-role key, provider client creation, host permissions, CSP changes, network calls, or OTP behavior.

### Harness Sources

| Source | Purpose | Runtime activation |
|---|---|---|
| `built_in_mock` | Normal default mock/local provider config. | Active by default. |
| `dev_empty_invalid` | Simulates missing provider-backed config using generic missing-field labels. | Test/helper only; not selected by default. |
| `dev_elevated_invalid` | Simulates a rejected elevated/server-style config shape using generic rejection metadata. | Test/helper only; not selected by default. |

The default source remains `built_in_mock`. The dev sources exist only as background-owned descriptors for validation and diagnostics. They do not contain real config values, placeholder URLs, key-like strings, tokens, sessions, provider responses, or client instances.

### Invalid Config Status

When the empty dev source is resolved through the background config boundary, the safe status is:

| Field | Empty dev status |
|---|---|
| `providerKind` | `supabase` |
| `providerMode` | `provider_backed` |
| `providerConfigured` | `false` |
| `configSource` | `dev_empty_invalid` |
| `valid` | `false` |
| `validationState` | `missing_config` |
| `missingFields` | `provider_project`, `public_client` |
| `errorCodes` | Generic missing-config code only |

When the elevated dev source is resolved, the safe status remains not configured and invalid, with `validationState: rejected` and a generic elevated-access rejection code. No raw value is exposed.

### Runtime Boundary

`identity:get-derived-state` still reports the default mock/local status in normal runtime execution. Public `H2O.Identity` snapshots remain unchanged and do not include provider config status. `identityAuthManager_getProviderAdapter()` must continue to resolve to the mock provider adapter for all executable default paths.

The harness must not add a new bridge action. Validators exercise the dev-only source helpers directly and check the redacted status shape.

### Phase 3.0O Gates

| Gate |
|---|
| Default status remains `built_in_mock`, `mock`, `local_dev`, configured, and valid. |
| Dev invalid statuses expose only safe source names, generic missing fields, and generic error codes. |
| No real config values are committed. |
| No provider client is created. |
| No provider auth/session method is called. |
| No network path is added. |
| Loader, manifest, provider bundle, page facade, onboarding UI, Control Hub, Ops Panel, and First-Run Prompt remain unchanged. |

### Final Decision

Phase 3.0O proves the config injection path can be exercised safely with empty/invalid dev-only descriptors. Mock/local remains the active default. The next phase, 3.0P, may introduce real dev config only through an untracked local file or secure environment source, and still must not add network behavior unless separately approved.

## Phase 3.0P — Real Dev Config Injection via Untracked/Env Source, Still No Network

Phase 3.0P adds dev-config injection plumbing for redacted readiness only. The build may read environment variables or an ignored local file to determine whether provider-backed dev config is present and structurally complete, but raw project endpoint and public client values are not serialized into generated `bg.js` or any extension output.

### Source Precedence

| Priority | Source | Notes |
|---|---|---|
| 1 | Environment | `H2O_IDENTITY_PROVIDER_KIND=supabase`, `H2O_IDENTITY_PROVIDER_PROJECT_URL`, and `H2O_IDENTITY_PROVIDER_PUBLIC_CLIENT`. |
| 2 | Ignored local file | `config/local/identity-provider.local.json`; ignored by git and not created by the build. |
| 3 | Built-in default | `built_in_mock`, used when no dev config source is present. |

The local file is for developer machines only. It must not be committed, packaged as a source artifact, or copied into page-facing outputs.

### Redacted Generated Status

The build emits only safe readiness metadata into the background generator:

| Allowed generated field |
|---|
| `schemaVersion` |
| `providerKind` |
| `providerMode` |
| `providerConfigured` |
| `configSource` |
| `valid` |
| `validationState` |
| `missingFields` |
| `errorCodes` |
| `capabilities` |

The generated background must never contain raw project endpoint, raw public client value, raw config object, service-role key, token, session, credential, provider response, or client instance. Page-facing outputs, public snapshots, Control Hub, Ops Panel, onboarding UI, First-Run Prompt, and web-accessible resources must not receive provider config values.

### Config Readiness Behavior

| Case | Redacted status | Runtime behavior |
|---|---|---|
| No config present | `built_in_mock`, `mock`, `local_dev`, configured, valid. | Mock adapter remains active. |
| Incomplete dev config | `supabase`, `provider_backed`, not configured, invalid, generic missing fields. | Mock adapter remains active. |
| Structurally complete dev config | `supabase`, `provider_backed`, configured, valid. | Mock adapter still remains active in Phase 3.0P. |
| Elevated/server-style config marker | Invalid and rejected with generic error code. | Mock adapter remains active. |

Phase 3.0P is readiness plumbing only. It does not call `createClient()`, does not call provider auth/session methods, does not add host permissions, does not change CSP, and does not make network calls.

### Phase 3.0P Gates

| Gate |
|---|
| No real config values are committed. |
| Raw dev config values are not serialized into `bg.js`, `loader.js`, page scripts, public snapshots, provider bundle, or web-accessible resources. |
| Valid injected config cannot activate the Supabase adapter in this phase. |
| No provider client is created. |
| No provider auth/session method is called. |
| No network path is added. |
| Existing identity and background-bundle validators pass with no config present. |

### Final Decision

Phase 3.0P proves dev config can be detected and summarized safely without exposing raw values or changing runtime auth behavior. The next phase should be a separately approved client-creation smoke test or permissions/network planning phase, not OTP.

## Phase 3.0Q — Host Permissions + CSP/Network Scope

Phase 3.0Q is documentation and validator hardening only. It does not change manifest generation, add host permissions, add `optional_host_permissions`, add CSP, create a Supabase client, make provider network calls, or implement OTP.

### Current Manifest Boundary

The current generated development manifests intentionally use broad development host permissions:

| Permission | Current status | Production status |
|---|---|---|
| `http://127.0.0.1:5500/*` | Dev local proxy access. | Dev-only. |
| `*://*/*` | Dev/unpacked broad loader access. | Production-unsafe. |
| Explicit `content_security_policy` | Absent. | Must remain absent until reviewed. |
| `optional_host_permissions` | Absent. | Future phase only. |
| Provider bundle in `web_accessible_resources` | Absent. | Must remain absent. |
| Controls `externally_connectable: { ids: ["*"] }` | Existing controls-build dev behavior. | Must be tightened before real auth. |

The broad host permissions are accepted only as the current dev baseline. They are not approval for production provider network access and must not be treated as a Supabase permission decision.

### Future Host Permission Direction

Future provider network scope must be narrow and explicit:

| Option | Recommendation |
|---|---|
| `https://<project-ref>.supabase.co/*` | Preferred production host permission after the exact project host is approved. |
| `https://*.supabase.co/*` | Possible multi-project fallback only if exact host binding is impractical and reviewed. |
| Existing `*://*/*` | Dev-only baseline, not production-safe. |

Future Supabase host access should likely use `optional_host_permissions` plus a runtime grant flow so provider network access is explicit. Phase 3.0Q does not add that flow.

### CSP Boundary

CSP remains unchanged in Phase 3.0Q. Do not add CSP relaxation, `unsafe-eval`, remote script allowances, or provider-specific CSP changes. Before any CSP change, the implementation phase must check the Chrome Extensions Manifest V3 `content_security_policy` documentation and validate extension load behavior.

### Readiness Separation

Provider readiness must remain split into separate concepts:

| Concept | Meaning |
|---|---|
| Config readiness | Redacted provider config shape is present and structurally valid. |
| Client readiness | A provider client can be constructed without leaking raw values. |
| Permission readiness | Manifest/runtime host access is approved and granted. |
| Network readiness | Provider network calls are allowed by phase scope. |

`providerConfigured: true` must not imply client creation, host permission approval, CSP approval, or network authorization.

### Future Phase Sequence

| Phase | Purpose |
|---|---|
| 3.0R | Lazy `createClient` smoke test, no auth call and no OTP. |
| 3.0S | Optional host permission and runtime grant flow, no auth call. |
| 3.0T | Dev/production manifest split to remove broad dev permissions from production. |
| 3.1A | Request OTP only, after config, client, permission, network, and UX gates are approved. |

`createClient()` belongs in 3.0R or later and must stay separate from OTP. `signInWithOtp()` remains blocked until 3.1A.

### Phase 3.0Q Validator Gates

The new 3.0Q validator must fail if:

| Gate |
|---|
| Either generated manifest contains `content_security_policy`. |
| Either generated manifest contains `optional_host_permissions`. |
| Either generated manifest contains Supabase-specific host permissions before an approved phase. |
| Manifest permissions include `webRequest`, `webRequestBlocking`, `cookies`, or `identity`. |
| The provider bundle or `provider/` directory is listed in `web_accessible_resources`. |
| Loader or page-facing outputs contain provider SDK/package names, provider bundle paths, probe markers, token fields, auth calls, Supabase URLs, service-role strings, anon-key labels, or JWT-like values. |
| H2O-owned provider source or probe wrapper calls provider auth methods before approval. |
| `createClient(` appears outside approved metadata inspection. |
| Provider bundle uses dynamic code execution such as `eval` or `new Function`. |

The validator should report current broad host permissions and controls `externally_connectable: ["*"]` as warnings only in Phase 3.0Q.

### Do-Not-Do Rules

| Rule |
|---|
| Do not add host permissions or optional host permissions in 3.0Q. |
| Do not add CSP or relax CSP in 3.0Q. |
| Do not create a provider client in 3.0Q. |
| Do not call provider auth/session APIs in 3.0Q. |
| Do not add provider network calls in 3.0Q. |
| Do not expose the provider bundle as web-accessible. |
| Do not expose provider SDK code to loader, page scripts, `H2O.Identity`, Control Hub, Ops Panel, onboarding UI, or First-Run Prompt. |
| Do not proceed to OTP until config, client, permission, network, and UX gates are approved. |

### Final Decision

Phase 3.0Q documents and validator-gates the host permission, CSP, and provider-network boundary. It makes no manifest behavior change, adds no CSP, adds no host permission, creates no client, and makes no network call.

## Phase 3.0R — Lazy createClient Smoke Test, No Auth Call, No OTP

Phase 3.0R adds a background-only lazy client-construction smoke test. It proves the provider bundle can construct a Supabase client through an explicit diagnostic smoke path, while leaving mock/local identity behavior active and unchanged.

### Smoke Inputs

The smoke uses reserved, non-real test inputs only:

| Input | Value | Rule |
|---|---|---|
| Smoke URL | `https://h2o-provider-client-smoke.invalid` | Reserved `.invalid` host; not a Supabase project URL. |
| Fake public client | `provider-client-smoke` | Non-token-like test string; not an anon key or credential. |

No real project URL, anon key, service-role key, token, session, credential, provider response, or provider config value is added.

### Lazy Construction Boundary

`createClient()` may appear only inside the named provider-bundle smoke function. The provider bundle may define that function at import time, but it must not construct a client during module import or service-worker boot.

The background captures the smoke function after loading the background-owned provider bundle and runs it only from the safe diagnostic probe path. The smoke result is sanitized before it appears in `providerConfigStatus.bundleProbe`.

### No-Network Proof

The smoke passes a local guarded fetch function into the Supabase client options. The guarded fetch does not patch `globalThis.fetch`; it records unexpected invocation and throws if called. The expected smoke result is:

| Field | Expected |
|---|---|
| `clientCreatedAtImport` | `false` |
| `clientCreated` | `true` after explicit smoke path |
| `networkEnabled` | `false` |
| `networkObserved` | `false` |
| `authCallsObserved` | `false` |
| `otpEnabled` | `false` |

If network is observed, the phase fails. If the reserved `.invalid` URL is rejected by `createClient()`, the strategy must stop for review rather than substituting a real-looking URL.

### Runtime Boundary

Phase 3.0R does not call auth/session methods, request OTP, verify OTP, use database/storage/realtime/functions APIs, add host permissions, add `optional_host_permissions`, or change CSP. It does not change public `H2O.Identity` APIs, public snapshots, onboarding UI, Control Hub, Ops Panel, First-Run Prompt, or page-facing outputs.

`identityAuthManager_getProviderAdapter()` remains mock/local. `providerConfigured` and client smoke status remain diagnostics only and do not activate provider-backed runtime behavior.

### Phase 3.0R Gates

| Gate |
|---|
| `createClient()` is called only inside the named provider-bundle smoke function. |
| Client creation does not happen at module import or service-worker boot. |
| No auth/session/OTP provider method is called. |
| No provider network call is observed. |
| No real Supabase URL, anon key, service-role key, token, JWT-like value, or raw config is added. |
| No provider code appears in loader, page scripts, public snapshots, web-accessible resources, Control Hub, Ops Panel, onboarding UI, or First-Run Prompt. |
| No manifest host permission, optional host permission, or CSP behavior changes. |
| Existing identity, bundle-isolation, and host/CSP/network validators pass. |

### Final Decision

Phase 3.0R proves lazy provider-client construction only. It adds no auth call, no OTP, no network behavior, no real config, no manifest change, and no provider mode switch. The next phase should be Phase 3.0S optional host permission/runtime grant flow or equivalent network-scope work, still without OTP unless separately approved.

## Phase 3.0S — Deferred Optional Host Permission Readiness

Phase 3.0S adds background-owned permission readiness metadata and validator gates only. It does not add `optional_host_permissions`, does not add `https://*.supabase.co/*`, does not change normal `host_permissions`, does not change CSP, does not call provider auth/session APIs, does not request OTP, and does not make provider network calls.

### Permission Decision

No exact Supabase project host is approved yet, so host access remains deferred:

| Permission item | Phase 3.0S decision |
|---|---|
| Normal Supabase `host_permissions` | Not added. |
| `optional_host_permissions` | Not added. |
| `https://<project-ref>.supabase.co/*` | Preferred later, after exact project host approval. |
| `https://*.supabase.co/*` | Deferred; requires explicit wildcard approval. |
| Current `*://*/*` dev permission | Existing dev-only baseline warning, not production approval. |
| Current `127.0.0.1` dev permission | Existing local proxy warning. |
| CSP | Unchanged; no relaxation and no `unsafe-eval`. |

The future runtime grant path must use an exact approved project host when possible. A wildcard Supabase host can be considered only if exact host binding is not workable and the broader scope is explicitly approved.

### Readiness Metadata

Phase 3.0S keeps permission and network readiness separate from config and client readiness. The background may expose only these redacted fields through `providerConfigStatus`:

| Field | Value |
|---|---|
| `permissionRequired` | `deferred` |
| `permissionReady` | `false` |
| `permissionSource` | `deferred_until_project_host` |
| `permissionHostKind` | `none` |
| `permissionStatus` | `deferred` |
| `permissionErrorCode` | `null` |
| `networkReady` | `false` |

These fields are diagnostics only. They do not activate Supabase mode, do not imply host access, and do not authorize network calls. `identityAuthManager_getProviderAdapter()` remains on the mock/local adapter.

### Runtime Boundary

Phase 3.0S does not call `chrome.permissions.contains()` or `chrome.permissions.request()` because no optional host pattern is declared. It also does not add a new bridge action or a user gesture flow. The existing `identity:get-derived-state` diagnostic path is sufficient to report deferred readiness.

`providerConfigStatus` must never expose raw project endpoints, public client values, service-role keys, tokens, sessions, credentials, provider responses, or raw config objects. Page scripts, `H2O.Identity`, loader output, Control Hub, Ops Panel, onboarding UI, First-Run Prompt, and web-accessible resources must not receive provider permission or config values.

### Phase 3.0S Validator Gates

Validators must fail if:

| Gate |
|---|
| A normal Supabase host permission is added. |
| `optional_host_permissions` is added before exact host or wildcard approval. |
| CSP is added or relaxed. |
| `chrome.permissions.contains()` or `chrome.permissions.request()` is called in the deferred path. |
| A new provider permission bridge action is added. |
| Provider auth/session/OTP calls appear. |
| Provider network calls appear. |
| Loader or page-facing outputs contain provider SDK/package names, bundle paths, probe markers, token fields, Supabase URLs, service-role strings, anon-key labels, or JWT-like values. |
| The provider bundle becomes web-accessible. |

Current broad dev host permissions and controls `externally_connectable: ["*"]` remain warnings only and must be tightened before real auth.

### Next Phase Direction

The next permission phase should either approve an exact Supabase project host and add an optional host permission/runtime grant flow, or perform the production/dev manifest split that removes broad dev permissions from production. `signInWithOtp()` remains blocked until config, client, permission, network, and UX gates are approved.

### Final Decision

Phase 3.0S records deferred permission readiness and keeps network readiness false. It adds no optional host permission, no wildcard Supabase host, no CSP change, no provider auth call, no OTP, no provider network call, and no provider mode switch.

## Phase 3.0T — Dev/Production Manifest Split, No Auth, No Network

Phase 3.0T adds a production-safe manifest profile so the broad development permissions cannot be mistaken for release-ready output. It does not add Supabase host access, does not add `optional_host_permissions`, does not add CSP, does not call provider auth/session APIs, does not request OTP, and does not make provider network calls.

### Manifest Profiles

| Profile | Output | Host permissions | Externally connectable | Purpose |
|---|---|---|---|---|
| Dev controls | `build/chrome-ext-dev-controls` | Dev proxy plus `*://*/*` | `ids: ["*"]` | Existing dev controls profile only. |
| Dev lean | `build/chrome-ext-dev-lean` | Dev proxy plus `*://*/*` | Absent | Existing lean dev profile only. |
| Production | `build/chrome-ext-prod` | `https://chatgpt.com/*` only | Absent | Production-safe manifest boundary. |

The dev profiles intentionally remain unchanged for local development. Their broad host permissions and wildcard external connectivity stay warnings, not production approval.

### Production Manifest Contract

The production profile must:

| Rule |
|---|
| Keep `content_scripts.matches` on `https://chatgpt.com/*`. |
| Remove `*://*/*`. |
| Remove `http://127.0.0.1:5500/*`. |
| Avoid Supabase host permissions. |
| Avoid `optional_host_permissions`. |
| Avoid explicit `content_security_policy`. |
| Avoid `externally_connectable: { ids: ["*"] }`. |
| Keep the provider bundle out of `web_accessible_resources`. |
| Keep loader/page outputs free of provider SDK code, provider bundle paths, tokens, auth calls, and provider network calls. |

Production host scope is limited to ChatGPT in Phase 3.0T. This is not approval for Supabase network access. The exact Supabase project host must still be approved before a later optional-host-permission or runtime grant phase.

### Runtime Boundary

Phase 3.0T is manifest-profile safety only. It does not change `H2O.Identity`, onboarding UI, Control Hub, Ops Panel, First-Run Prompt, MiniMap, Library, Folders, Categories, Tags, or Labels. The active identity provider remains mock/local. The existing Phase 3.0R lazy client smoke remains diagnostic only and must not call auth/session/OTP/provider APIs or provider network.

### Validator Gates

The host/CSP/network validator must inspect dev controls, dev lean, and production outputs. It should continue warning on dev-only broad permissions, but it must hard-fail if the production manifest contains broad dev host access, localhost proxy access, Supabase host access, optional host permissions, CSP, or wildcard external connectivity.

### Next Phase Direction

After 3.0T, the next safe step should be exact-host permission grant planning or a controlled real-config/client-readiness phase. `signInWithOtp()` remains blocked until config, client, permission, network, and UX gates are separately approved.

### Final Decision

Phase 3.0T adds and validates a production-safe manifest boundary. It keeps dev profiles unchanged, adds no Supabase host permission, adds no optional host permission, adds no CSP, adds no auth call, adds no OTP, adds no provider network call, and keeps mock/local active.

## Phase 3.0U — Exact Supabase Project Host Permission Plan, No Network

Phase 3.0U keeps exact-host permission support deferred because no approved Supabase project host is available. It adds no normal Supabase host permission, no `optional_host_permissions`, no wildcard Supabase host, no CSP change, no provider auth/session call, no OTP, and no provider network call.

### Exact Host Requirement

Future Supabase host permission must be based on an approved exact project host:

| Host pattern | Phase 3.0U decision |
|---|---|
| `https://<project-ref>.supabase.co/*` | Required later before optional host permission can be added. |
| `https://*.supabase.co/*` | Not approved; requires explicit wildcard approval. |
| Hardcoded project host in repo | Not allowed. |
| Real project URL from committed config | Not allowed. |
| Normal `host_permissions` for Supabase | Not allowed. |
| `optional_host_permissions` for Supabase | Deferred until exact host approval. |

The production profile remains limited to `https://chatgpt.com/*`. Dev controls and dev lean keep broad development host permissions as warnings only.

### Permission Readiness

The existing Phase 3.0S readiness state remains the correct runtime contract:

| Field | Value |
|---|---|
| `permissionRequired` | `deferred` |
| `permissionReady` | `false` |
| `permissionSource` | `deferred_until_project_host` |
| `permissionHostKind` | `none` |
| `permissionStatus` | `deferred` |
| `permissionErrorCode` | `null` |
| `networkReady` | `false` |

These values are redacted diagnostics only. They do not activate the Supabase adapter, do not imply permission grant, and do not authorize provider network calls.

### Future Runtime Grant Flow

A later exact-host phase may add a background-owned permission helper, but it must meet these rules:

| Rule |
|---|
| Derive the optional host permission only from an approved exact project host. |
| Reject non-HTTPS hosts. |
| Reject hosts that do not end exactly in `.supabase.co`. |
| Reject `https://*.supabase.co/*` unless explicitly approved. |
| Do not request permission automatically. |
| Require a future explicit user gesture before `chrome.permissions.request()`. |
| Keep raw host/config out of page scripts, public snapshots, Control Hub, Ops Panel, onboarding UI, First-Run Prompt, and web-accessible resources unless separately approved. |
| Keep `networkReady` false until network scope is separately approved. |

Phase 3.0U does not add that helper or bridge action yet because there is no exact host to request.

### Validator Gates

Validators must prove:

| Gate |
|---|
| Dev controls and dev lean still pass with warnings for broad dev host permissions. |
| Production remains narrow and does not include `*://*/*` or `http://127.0.0.1:5500/*`. |
| No Supabase host permission exists in normal `host_permissions`. |
| `optional_host_permissions` remains absent. |
| No wildcard Supabase permission exists. |
| No CSP exists. |
| No `chrome.permissions.contains()` or `chrome.permissions.request()` path exists. |
| No provider permission bridge action exists. |
| No auth/session/OTP/provider network call exists. |
| Provider bundle remains background-owned and not web-accessible. |
| Loader/page outputs remain clean. |
| `providerConfigStatus.networkReady` remains false. |

### Next Phase Direction

The next safe phase may either introduce approved exact-host optional permission wiring or continue real-dev config/client readiness review. It must still not request OTP until config, client, permission, network, session storage, and UX gates are approved.

### Final Decision

Phase 3.0U documents and validates exact-host permission deferral. It adds no Supabase host permission, no optional host permission, no wildcard host, no CSP, no auth call, no OTP, no provider network call, and no provider mode switch.

## Phase 3.0V — Real Dev Config Readiness Activation, No Auth Call, No Network

Phase 3.0V gates real dev Supabase config readiness without activating provider auth or provider network behavior. It is documentation and validator hardening only. It does not create a real config file, does not commit a project URL or public client value, does not serialize raw config into generated extension outputs, does not add host permissions, does not add `optional_host_permissions`, does not add CSP, does not call provider auth/session APIs, does not request OTP, and does not make provider network calls.

### Readiness Contract

Real dev config readiness may be derived only from approved env/local sources already owned by the build boundary:

| Source | Phase 3.0V contract |
|---|---|
| Environment | May provide presence metadata for a future project endpoint and public client value. Raw values must not be serialized into `bg.js`, `loader.js`, page outputs, public snapshots, web-accessible resources, Control Hub, Ops Panel, onboarding UI, or First-Run Prompt. |
| Local config file | Must remain untracked and ignored at `config/local/identity-provider.local.json`. The file is not created by this phase. |
| Committed repo config | Not allowed for real project endpoints, public client values, service-role keys, secret keys, tokens, sessions, or credentials. |
| Validator-only simulation | May use redacted complete config metadata to prove readiness behavior. It must not use real-looking URLs, key values, JWT-like strings, or raw config field exposure. |

With no dev config present, the runtime contract remains:

| Field | Value |
|---|---|
| `providerKind` | `mock` |
| `providerMode` | `local_dev` |
| `configSource` | `built_in_mock` |
| `valid` | `true` |
| `permissionReady` | `false` |
| `networkReady` | `false` |
| Active adapter | mock/local |

When complete dev config is present through the approved env/local boundary, only redacted readiness metadata may report `providerKind: "supabase"`, `providerMode: "provider_backed"`, `providerConfigured: true`, `valid: true`, and `configSource: "dev_env"` or `"dev_local_file"`. This readiness does not activate the Supabase adapter in Phase 3.0V and does not imply permission readiness, client activation with real config, session readiness, or network readiness.

### Redaction Rules

`providerConfigStatus` may expose only readiness metadata:

| Allowed readiness fields |
|---|
| `schemaVersion` |
| `providerKind` |
| `providerMode` |
| `providerConfigured` |
| `configSource` |
| `valid` |
| `validationState` |
| `missingFields` with generic labels only |
| `errorCodes` with generic codes only |
| `capabilities` |
| deferred permission fields |
| `networkReady` |
| `bundleProbe` |

It must never expose a raw project endpoint, public client value, anon/publishable key, service-role key, secret key, raw config object, token, session, credential, provider response, provider user object, or generated provider client object.

The Supabase public client/anon key is public client material, but in this project it remains background-owned. It must not be exposed to page scripts, public snapshots, loader output, Control Hub, Ops Panel, onboarding UI, First-Run Prompt, or web-accessible resources.

### Validator Gates

Validators must prove:

| Gate |
|---|
| The local config path remains ignored and uncommitted. |
| Build-time env/local discovery reduces raw inputs to redacted presence/readiness metadata. |
| Generated `bg.js` receives only sanitized provider config status, not raw config values. |
| A validator-only redacted complete config can report configured/valid readiness while `permissionReady` remains false and `networkReady` remains false. |
| Incomplete config still reports generic missing fields such as `provider_project` and `public_client`. |
| Elevated/server-style config remains rejected with generic error codes only. |
| Loader and page-facing outputs contain no provider config values, token fields, auth calls, or provider SDK code. |
| Production manifest remains narrow. |
| No Supabase normal host permission or `optional_host_permissions` exists. |
| No CSP exists. |
| No provider auth/session/OTP/provider network calls exist. |

### Next Phase Direction

The next safe phase must still keep OTP blocked. Before any provider network call, the project needs explicit approval for exact project host permission, network scope, real-config handling, client readiness with real config, session storage policy, and UX/user gesture boundaries.

### Final Decision

Phase 3.0V validates and documents real dev config readiness only. It commits no real config values, serializes no raw project endpoint or public client value, adds no host permission, adds no CSP, makes no auth/session/OTP call, makes no provider network call, and keeps mock/local active.

## Phase 3.0W — Rename Provider Bundle Artifact, No Behavior Change

Phase 3.0W renames the background-owned provider bundle artifact from dummy wording to Supabase provider wording because the bundle now contains the approved Supabase SDK import and Phase 3.0R lazy client smoke. This is a naming and validator-alignment phase only. It does not change identity behavior, manifest permissions, `optional_host_permissions`, CSP, loader behavior, public `H2O.Identity`, provider config readiness, permission readiness, network readiness, onboarding UI, Control Hub, Ops Panel, First-Run Prompt, MiniMap, Library, Folders, Categories, Tags, or Labels.

### Rename Contract

| Artifact | Phase 3.0W name |
|---|---|
| Provider source entry | `tools/product/identity/identity-provider-supabase.entry.mjs` |
| Built provider bundle | `provider/identity-provider-supabase.js` |
| Background bundle path | `IDENTITY_PROVIDER_BUNDLE_PATH` points to `provider/identity-provider-supabase.js` |
| Validator constants | Use neutral provider-bundle naming rather than dummy-bundle naming. |

The previous dummy wording remains relevant only as historical documentation for Phases 3.0H and 3.0I. Current source and generated outputs must use the renamed Supabase provider artifact.

### Behavior Preservation

The provider bundle probe behavior remains unchanged:

| Probe field | Required value |
|---|---|
| `kind` | `supabase-client-create-smoke` |
| `phase` | `3.0R` |
| `smokeRun` | `true` after the derived-state diagnostic path runs |
| `clientCreated` | `true` after the lazy smoke path runs |
| `networkObserved` | `false` |
| `authCallsObserved` | `false` |
| `otpEnabled` | `false` |

The active identity mode also remains unchanged: mock/local stays active by default, `configSource` remains `built_in_mock` when no dev config is injected, `permissionReady` remains false, and `networkReady` remains false.

### Validator Gates

Validators must prove:

| Gate |
|---|
| The renamed source entry exists. |
| The legacy provider entry file is absent. |
| Built controls, lean, and production outputs contain `provider/identity-provider-supabase.js`. |
| The legacy generated provider bundle path is removed during normal builds. |
| The provider bundle appears only in built `bg.js` and the background-owned provider bundle file. |
| The provider bundle remains absent from `web_accessible_resources`. |
| Loader and page-facing outputs do not reference the provider bundle path, provider bundle marker, provider SDK code, token fields, auth calls, or provider config values. |
| No auth/session/OTP/provider network call is added. |
| Existing mock identity validators still pass. |

### Final Decision

Phase 3.0W renames the provider bundle artifact only. It adds no auth call, no OTP, no provider network call, no real config activation, no host permission, no optional host permission, no CSP, and no provider mode switch. The next phase should be conditional SDK loading or real-config client readiness, not OTP.

## Phase 3.0X — Conditional Provider SDK Bundle Loading, No Real Config, No Auth, No Network

Phase 3.0X makes loading of the background-owned Supabase provider SDK bundle conditional. The bundle is still built as a packaged background artifact for validation and future provider-backed readiness, but the default mock/no-config runtime must not load it at service-worker boot.

### Default Mock/No-Config Behavior

When no redacted complete provider-backed config is injected, `providerConfigStatus.bundleProbe` reports an explicit skipped state:

| Probe field | Default value |
|---|---|
| `expected` | `false` |
| `loaded` | `false` |
| `kind` | `skipped` |
| `phase` | `3.0X` |
| `skipReason` | `provider_config_inactive` |
| `smokeRun` | `false` |
| `clientCreated` | `false` |
| `networkObserved` | `false` |
| `authCallsObserved` | `false` |
| `otpEnabled` | `false` |

Mock/local remains the active identity mode. `providerKind` remains `mock`, `providerMode` remains `local_dev`, `configSource` remains `built_in_mock`, `permissionReady` remains false, and `networkReady` remains false.

### Provider-Backed Readiness Simulation

Validators may simulate a redacted complete provider-backed config status. In that validator-only path, the background may load `provider/identity-provider-supabase.js` through the conditional `importScripts()` branch and run the existing lazy `createClient` smoke diagnostic. That simulation still uses no raw real project URL, no public client value, no token-like value, and no service-role material.

Even when the bundle is loaded for simulated provider-backed readiness, the smoke remains diagnostic only: no auth/session method, OTP method, database/storage/realtime/functions API, or provider network API may be called. `permissionReady` and `networkReady` remain false.

### Validator Gates

Validators must prove:

| Gate |
|---|
| No top-level unconditional `identityProviderBundle_loadProbe()` remains. |
| Default mock/no-config status does not call `importScripts()` for the provider bundle. |
| Default `bundleProbe` exposes only the skipped inactive-config diagnostic. |
| Redacted complete provider-backed simulation may load the provider bundle once and still reports no auth, no OTP, and no network. |
| The provider bundle remains absent from `web_accessible_resources`. |
| Loader and page-facing outputs remain free of provider SDK code, provider bundle path, token fields, auth calls, and raw config values. |
| Production manifest remains narrow with no Supabase host permission, no `optional_host_permissions`, and no CSP. |

### Final Decision

Phase 3.0X changes only provider SDK bundle loading timing. It adds no real config activation, no auth call, no OTP, no provider network call, no host permission, no optional host permission, no CSP, and no public `H2O.Identity` behavior change. The next phase should be real-config client readiness or exact-host permission grant planning, not OTP.

## Phase 3.0Y — Dev-Only Real-Config Lazy Client Readiness, No Auth, No Network

Phase 3.0Y adds a dev/local-only readiness path for constructing a Supabase client with approved real dev config, while still blocking auth, OTP, session APIs, provider APIs, and provider network. The default no-config runtime keeps the Phase 3.0X skipped bundle behavior and remains mock/local.

### Dev-Only Private Config Artifact

Complete dev config may be carried only by a background-owned private artifact:

| Artifact | Phase 3.0Y contract |
|---|---|
| Path | `provider/identity-provider-private-config.js` |
| Emission | Controls/lean dev builds only, and only when approved env/local config is complete and valid. |
| Production | Never emitted by the production profile in Phase 3.0Y, even if env/local config exists. |
| Cleanup | Deleted from output when config is absent, incomplete, invalid, or when the profile is production. |
| Web access | Must never appear in `web_accessible_resources`; the provider directory remains background-owned. |

Raw project URL and public client values must not be serialized into `bg.js`, `loader.js`, page scripts, public snapshots, diagnostics, Control Hub, Ops Panel, onboarding UI, First-Run Prompt, or any web-accessible resource. In Phase 3.0Y, raw values may exist only inside the ignored local/env input and the dev-only private background artifact.

### Lazy Client Readiness

The provider bundle exposes a second explicit smoke path, `runRealConfigClientSmoke(config)`, for real-config client readiness. It calls `createClient()` only inside that named lazy function, passes a guarded local fetch through Supabase client options, and disables session persistence, auto-refresh, and URL session detection. The guarded fetch records an unexpected network attempt and throws; the expected result is still no network observed.

The smoke must not touch `.auth`, `.from`, `.storage`, `.realtime`, `.functions`, OTP methods, session methods, database APIs, storage APIs, realtime APIs, functions APIs, or any provider network path. Client construction remains diagnostic readiness only; the active identity adapter remains mock/local.

### Readiness Fields

With no config, defaults remain:

| Field | Default value |
|---|---|
| `providerKind` | `mock` |
| `providerMode` | `local_dev` |
| `configSource` | `built_in_mock` |
| `permissionReady` | `false` |
| `networkReady` | `false` |
| `clientReady` | `false` |
| `bundleProbe.kind` | `skipped` |
| `bundleProbe.phase` | `3.0X` |
| `bundleProbe.loaded` | `false` |

With complete dev config in a dev build, redacted readiness may report `providerKind: "supabase"`, `providerMode: "provider_backed"`, `providerConfigured: true`, `valid: true`, `clientReady: true`, and safe `realConfig*` smoke booleans. `permissionReady` remains false, `networkReady` remains false, and the Supabase adapter is not selected for runtime identity commands in this phase.

### Validator Gates

Validators must prove:

| Gate |
|---|
| Default no-config controls/lean/prod outputs do not contain the private config artifact. |
| A validator-controlled dev config build emits the private artifact only in a dev output. |
| The same validator-controlled config does not emit the private artifact in production output. |
| Raw config values appear only in the private dev artifact during validator simulation. |
| Production output remains raw-config-free and production manifest remains narrow. |
| The provider bundle and private config artifact are not web-accessible. |
| Loader/page-facing outputs, snapshots, diagnostics, Control Hub, Ops Panel, onboarding UI, and First-Run Prompt do not expose raw config. |
| No Supabase host permission, `optional_host_permissions`, or CSP is added. |
| No auth/session/OTP/provider API/provider network call is added. |
| `permissionReady` and `networkReady` remain false. |

### Final Decision

Phase 3.0Y enables dev-only real-config client readiness through a private background artifact and lazy guarded client construction. It adds no auth call, no OTP, no provider network call, no host permission, no optional host permission, no CSP, no public `H2O.Identity` behavior change, and no provider mode switch. The next phase must still not request OTP until exact-host permission, network scope, session storage, and UX gates are explicitly approved.

## Phase 3.0Z — Exact-Host Optional Permission Grant Flow, No OTP, No Provider Network

Phase 3.0Z adds exact-host optional permission readiness for a future Supabase project host. It does not activate provider network behavior, does not request OTP, and does not expose any page-facing permission request API.

### Exact-Host Strategy

The build may derive an optional host permission only from complete approved env/local provider config. The accepted project URL shape is intentionally narrow:

| Requirement |
|---|
| HTTPS only. |
| Host must match `<project-ref>.supabase.co`. |
| No credentials, port, wildcard, localhost, arbitrary domain, service-role marker, or secret marker. |
| Generated permission pattern is exactly `https://<project-ref>.supabase.co/*`. |

Wildcard Supabase permission, including `https://*.supabase.co/*`, remains forbidden. Supabase must not be added to normal `host_permissions`. If no exact approved provider config exists, `optional_host_permissions` remains absent and permission readiness stays deferred.

Production remains raw-config-free by default in this phase. Under current production rules, production emits no private provider config artifact and no optional provider permission unless a later production-config phase explicitly approves that behavior.

### Background Readiness

The background owns permission readiness. With no config, status remains:

| Field | Default value |
|---|---|
| `permissionRequired` | `deferred` |
| `permissionReady` | `false` |
| `permissionSource` | `deferred_until_project_host` |
| `permissionHostKind` | `none` |
| `permissionStatus` | `deferred` |
| `networkReady` | `false` |

With complete provider-backed config and an exact optional host pattern, the background may check grant state with `chrome.permissions.contains({ origins: [exactPattern] })`. Safe status may report `permissionRequired: true`, `permissionSource: "optional_host_permission"`, `permissionHostKind: "exact_supabase_project"`, and `permissionStatus: "granted"` or `"not_granted"`. It must not expose the raw project URL, public client value, tokens, sessions, provider responses, or provider client object.

An internal `identityProviderPermission_requestExactHost()` helper may exist for a later user-gesture phase. It is not called automatically and is not exposed through the loader, bridge, `H2O.Identity`, onboarding UI, Control Hub, Ops Panel, First-Run Prompt, or any page-facing API in Phase 3.0Z. Chrome user-gesture wiring remains deferred.

Even if permission is granted, `networkReady` remains false in Phase 3.0Z. The active identity adapter remains mock/local. No auth/session/OTP/provider API or provider network call is added.

### Validator Gates

Validators must prove:

| Gate |
|---|
| Default no-config controls, lean, and production builds have no `optional_host_permissions`. |
| Dev temp build with exact config emits exactly one optional permission: `https://<project-ref>.supabase.co/*`. |
| Production temp build with the same env emits no private config and no optional provider permission. |
| Wildcard Supabase optional permission is absent and forbidden. |
| Normal Supabase `host_permissions` are absent and forbidden. |
| `chrome.permissions.contains()` appears only in the exact-host readiness helper. |
| `chrome.permissions.request()` appears only in the internal exact-host request helper. |
| No `identity:request-provider-permission` bridge action or loader allowlist entry exists. |
| `permissionReady` may reflect grant state, but `networkReady` remains false. |
| Provider bundle and private config artifacts remain absent from `web_accessible_resources`. |
| Loader/page-facing outputs remain free of raw config, provider SDK code, provider bundle paths, token fields, auth calls, OTP calls, and provider network calls. |

### Final Decision

Phase 3.0Z gates exact-host optional permission readiness only. It adds no wildcard Supabase permission, no normal Supabase host permission, no CSP, no auth call, no OTP, no provider network call, no provider adapter activation, no page-facing permission request API, and no public `H2O.Identity` behavior change.

## Phase 3.0AA — Network Arming Gate, No Provider Call

Phase 3.0AA adds the final explicit network arming diagnostic before any future provider call. The phase flag is background-owned, literal false, and not controlled by page scripts, Control Hub, Ops Panel, or config alone.

### Readiness Formula

Provider network readiness can become true only in a later approved phase when all inputs are true:

| Required input |
|---|
| `providerConfigured === true` |
| `clientReady === true` |
| `permissionReady === true` |
| `phaseNetworkEnabled === true` |

In Phase 3.0AA, `phaseNetworkEnabled` is always false, so `networkReady` is always false even when validator simulations make provider config, client readiness, and exact-host permission readiness true.

Safe status may expose:

| Field | Phase 3.0AA value |
|---|---|
| `phaseNetworkEnabled` | `false` |
| `networkReady` | `false` |
| `networkStatus` | `blocked` |
| `networkBlockReason` | `phase_not_enabled` |

These fields are diagnostic only. They must not expose raw config, host, key, token, session, provider response, or provider client object.

### Validator Gates

Validators must prove:

| Gate |
|---|
| Normal controls, lean, and production builds report `phaseNetworkEnabled: false`. |
| `networkReady` remains false in default mock/local status. |
| Simulated provider-backed config with `clientReady: true` still reports `networkReady: false`. |
| Simulated exact-host permission granted still reports `networkReady: false` because the phase is not enabled. |
| `networkStatus` remains `blocked` and `networkBlockReason` remains `phase_not_enabled`. |
| The mock/local provider adapter remains active. |
| No auth/session/OTP/provider API/provider network call is added. |

### Final Decision

Phase 3.0AA adds network arming diagnostics only. It adds no auth call, no OTP, no provider network call, no session storage, no provider adapter activation, no manifest permission change, no CSP, no public `H2O.Identity` behavior change, and no UI change. The next phase should be a final Phase 3.1A implementation review before any request-OTP path is allowed.

## Phase 3.1A — Request Email OTP Only

Phase 3.1A adds the first approved provider network path: requesting an email OTP through the background-owned provider bundle only. It does not verify OTP, read sessions, refresh sessions, sign out of the provider, store tokens, write cloud profile/workspace data, add UI, or move provider logic into loader/page code.

Network arming is explicit and dev-only. `phaseNetworkEnabled` becomes true only when the build is run with:

```sh
H2O_IDENTITY_PHASE_NETWORK=request_otp
```

If the flag is absent, `phaseNetworkEnabled` remains false. If the flag is present without complete approved provider config, the build fails. If the flag is present for the production profile, the build fails until a later production-auth phase approves it.

`networkReady` remains a derived gate:

```text
providerConfigured && clientReady && permissionReady && phaseNetworkEnabled
```

The existing bridge command `identity:request-email-otp` is the only request path. The background keeps mock/local behavior for default no-config builds and all non-request-OTP commands. When provider config is present, `identityAuthManager_requestEmailOtp()` checks the readiness gates and either returns a safe blocked error or calls the provider-bundle helper. `identityAuthManager_getProviderAdapter()` is not globally switched to Supabase.

`signInWithOtp()` is allowed only inside `tools/product/identity/identity-provider-supabase.entry.mjs` and the generated background-owned provider bundle. The provider helper receives raw config only through the private background config carrier, constructs the client lazily, calls `client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`, and returns only normalized metadata. The background stores only token-free local pending-email runtime state.

Safe success response:

```js
{
  ok: true,
  nextStatus: "email_pending",
  emailMasked,
  pendingEmailMasked,
  retryAfterSeconds: null,
  cooldownSeconds: null
}
```

Safe failure response:

```js
{
  ok: false,
  nextStatus: "auth_error",
  errorCode,
  errorMessage
}
```

Allowed failure codes are `identity/invalid-email`, `identity/provider-not-configured`, `identity/client-not-ready`, `identity/permission-not-ready`, `identity/network-not-enabled`, `identity/network-not-ready`, `identity/provider-auth-unavailable`, `identity/provider-request-failed`, `identity/provider-rate-limited`, `identity/provider-network-failed`, `identity/provider-rejected`, and `identity/unknown-provider-error`.

3.1A still forbids `verifyOtp`, `getSession`, provider `refreshSession`, provider `signOut`, OAuth, magic-link handling, password login, database/storage/realtime/functions APIs, token/session storage, raw provider responses across the bridge, raw config across the bridge, page-side Supabase calls, Control Hub/Ops Panel auth ownership, loader provider ownership, wildcard Supabase permissions, normal Supabase `host_permissions`, and CSP changes.

## Phase 3.1B — Verify Email OTP + Background Session Boundary

Phase 3.1B adds only email OTP verification through the existing `identity:verify-email-otp` background bridge action. The only approved provider verification call is `client.auth.verifyOtp({ email, token, type: "email" })` inside the background-owned provider bundle source and generated provider bundle.

The background remains the owner of all provider session material. On success, the raw provider session is stored only in `chrome.storage.session` under `h2oIdentityProviderSessionV1`. If `chrome.storage.session` is unavailable, verification fails closed and does not fall back to `chrome.storage.local`. Existing sign-out clears this local session key but does not call provider `signOut`.

The runtime pending email is the source of truth. A caller-supplied email must match the pending email, and mismatches return `identity/email-mismatch`. The bridge success response is limited to `ok`, `nextStatus: "verified_no_profile"`, masked email fields, `userIdMasked`, `emailVerified`, `sessionExpiresAt`, and `verifiedAt`. Failure responses contain only `ok: false`, `nextStatus: "auth_error"`, a normalized error code/message, and `retryAfterSeconds: null`.

3.1B still forbids provider `getSession`, provider `refreshSession`, provider `signOut`, OAuth, magic links, password login, id-token auth, token/session persistence in `chrome.storage.local`, raw provider responses across the bridge, raw user/session/token/config fields in public snapshots or diagnostics, profile/workspace cloud writes, loader/page Supabase ownership, UI/onboarding changes, manifest permission changes, and CSP changes.

## Phase 3.1C — Session Wake Hydration + Expiry + Local Sign-Out Hardening

Phase 3.1C is local session lifecycle only. On background wake/start, the service worker may read the existing raw provider session from `chrome.storage.session[h2oIdentityProviderSessionV1]` and rebuild only safe public `verified_no_profile` state when the session is structurally valid and not expired.

Wake hydration derives only masked email, masked user id, `emailVerified: true`, and `sessionExpiresAt`. It never calls Supabase, never loads provider session through `chrome.storage.local`, never calls provider `getSession`/`refreshSession`/`signOut`, and never exposes raw session, raw user, token, or config fields across the bridge or public snapshots.

Expired or malformed local sessions are removed from `chrome.storage.session`, runtime/snapshot state is reset safely, and the page receives the existing sanitized sign-out/reset push. The expiry check uses a conservative local skew window so sessions close to expiry are treated as expired rather than refreshed.

`identity:sign-out` remains a local cleanup action in this phase: it clears runtime, stored snapshot, and `h2oIdentityProviderSessionV1`, then broadcasts a safe reset. Persistent refresh-token storage, provider refresh policy, provider sign-out, and profile/workspace cloud writes remain later-phase decisions.

## Phase 3.1D — Lazy Provider Refresh + Session-Only Storage

Phase 3.1D adds only lazy Supabase session refresh. The approved provider call is `client.auth.refreshSession({ refresh_token })`, confined to the background-owned provider bundle source and generated provider bundle.

Refresh uses the existing raw session from `chrome.storage.session[h2oIdentityProviderSessionV1]`. `identity:get-snapshot`, `identity:get-derived-state`, and `identity:refresh-session` may trigger refresh only when the stored session is near expiry. Wake/start hydration remains local-only and does not perform provider network refresh.

The refreshed provider session replaces the entire old raw session in `chrome.storage.session`, which handles refresh-token rotation without exposing token material. Public state remains `verified_no_profile` and may update only safe fields such as `sessionExpiresAt` and `updatedAt`.

Refresh failure, malformed provider response, missing refresh token, or session-storage failure clears the local provider session key and resets safe runtime/snapshot state. 3.1D still forbids provider `getSession`, provider `signOut`, `chrome.storage.local` provider session persistence, `chrome.alarms`, SDK `autoRefreshToken`, SDK `persistSession`, UI/onboarding changes, loader changes, manifest/CSP/permission changes, and profile/workspace cloud writes.

## Phase 3.1E — Best-Effort Provider Sign-Out

Phase 3.1E adds provider-side Supabase sign-out as best-effort only. The approved provider call is `client.auth.signOut({ scope: "local" })`, confined to the background-owned provider bundle source and generated provider bundle.

`identity:sign-out` remains local-cleanup authoritative. It reads the current raw session from `chrome.storage.session[h2oIdentityProviderSessionV1]`, attempts provider sign-out only when provider config, client readiness, exact-host permission, and network arming are ready, then always clears runtime state, stored public snapshot, the provider session key, and broadcasts a null reset.

The provider helper uses helper-local in-memory SDK storage seeded with the raw session so `signOut({ scope: "local" })` can find the current session without writing token material to `chrome.storage.local`, page storage, or persistent SDK storage. If the SDK requires `persistSession: true` for this storage adapter, that setting is confined to the sign-out helper and remains ephemeral.

Provider sign-out failure, timeout, missing permission, missing network readiness, or missing/unusable access token never blocks local cleanup and is not exposed publicly. The public response remains `{ ok: true, nextStatus: "anonymous_local" }` unless local cleanup itself fails. 3.1E still forbids provider `getSession`, provider refresh during sign-out, provider `signOut` with global scope, persistent provider session storage, UI/onboarding changes, loader changes, manifest/CSP/permission changes, and profile/workspace cloud writes.

## Phase 3.2B — Profile/Workspace SQL Schema + RLS Migration

Phase 3.2B adds the SQL-only MVP cloud identity schema in `supabase/migrations/202604300001_identity_profile_workspace_rls.sql`. It creates `profiles`, `workspaces`, and `workspace_memberships`, enables and forces RLS on all three tables, adds owner-only MVP membership constraints, adds `updated_at` triggers, and adds the atomic `complete_onboarding(display_name, avatar_color, workspace_name)` RPC.

The migration stores no email column in `profiles`, no provider tokens, no auth session material, and no service-role material. The RPC derives the user from `auth.uid()` and never accepts a user id from the client. Phase 3.2B does not add extension runtime RPC calls, provider bundle database calls, UI changes, loader changes, manifest changes, CSP changes, or production DB application.

## Phase 3.2C — Dev Migration Apply + Live RLS Validation Harness

Phase 3.2C validates the 3.2B database security model against a dev or disposable Supabase project before any extension code is allowed to call `complete_onboarding`.

Apply the migration manually to a dev/disposable project only:

```sh
psql -v ON_ERROR_STOP=1 -f supabase/migrations/202604300001_identity_profile_workspace_rls.sql
```

The same SQL may also be pasted into the Supabase Dashboard SQL editor for the dev project. Do not apply this migration to production in Phase 3.2C, and do not commit database URLs, passwords, anon keys, service-role keys, sessions, or tokens.

The live harness is `tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs`. It is opt-in and skips without network unless `H2O_SUPABASE_RLS_LIVE=1` is set. If `H2O_SUPABASE_RLS_LIVE_REQUIRED=1` is set, missing live configuration fails closed.

Required live env vars:

| Env var |
|---|
| `H2O_SUPABASE_TEST_URL` |
| `H2O_SUPABASE_TEST_ANON_KEY` |
| `H2O_SUPABASE_TEST_SERVICE_ROLE_KEY` |

Optional live env vars:

| Env var |
|---|
| `H2O_SUPABASE_TEST_USER_A_EMAIL` |
| `H2O_SUPABASE_TEST_USER_A_PASSWORD` |
| `H2O_SUPABASE_TEST_USER_B_EMAIL` |
| `H2O_SUPABASE_TEST_USER_B_PASSWORD` |

If optional users are not provided, the harness creates disposable confirmed users with the service-role key and deletes those generated users in `finally`. The service-role key is allowed only inside the live validation harness for test user setup/cleanup. It is never used in extension source, generated extension output, provider runtime, loader, UI, or public `H2O.Identity`, and the harness never prints it.

Run static checks:

```sh
node --check tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs
node tools/validation/identity/validate-identity-phase3_2b-schema.mjs
node tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs
```

Run live validation only after applying the migration to a dev/disposable project:

```sh
H2O_SUPABASE_RLS_LIVE=1 \
H2O_SUPABASE_TEST_URL=... \
H2O_SUPABASE_TEST_ANON_KEY=... \
H2O_SUPABASE_TEST_SERVICE_ROLE_KEY=... \
node tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs
```

The live harness validates that User A can complete onboarding, repeated onboarding is idempotent, users cannot read or mutate each other's profile/workspace/membership rows, anon cannot execute the RPC or mutate identity tables, owner-only role constraints hold, delete/update policies are absent, and User B cannot read User A workspace or membership unless membership exists.

3.2C still forbids extension runtime profile/workspace writes, provider bundle RPC/database calls, UI/onboarding changes, loader changes, public `H2O.Identity` changes, manifest/CSP/permission changes, production DB application, and committed secrets.

## 15.12 Phase 3.2D - Extension RPC Wiring for `complete_onboarding`

Phase 3.2D wires the existing `identity:complete-onboarding` background command to the Supabase `complete_onboarding` RPC through the background-owned provider bundle only. Mock/local onboarding remains unchanged, and no loader, UI, public `H2O.Identity`, manifest, CSP, permission, package, service-role, or token-persistence changes are introduced.

The provider bundle owns the only approved database call:

```js
client.rpc("complete_onboarding", {
  p_display_name,
  p_avatar_color,
  p_workspace_name
})
```

The helper accepts only trimmed `displayName`, `avatarColor`, and `workspaceName` values that match the 3.2B migration constraints. It uses the current background-held provider session only to attach an `Authorization: Bearer <access_token>` header to a one-shot client. It does not call `client.auth.setSession`, `.from(...)`, raw SQL, other RPC names, service-role paths, storage, realtime, functions, or provider session APIs.

The background provider path is allowed only when provider config is active, the network gate is ready, a verified provider session exists in `chrome.storage.session`, and the current safe state is `verified_no_profile`, compatibility `profile_ready`, or idempotent `sync_ready`. Before the RPC it runs the existing lazy session hydration/refresh path, then reads the raw session internally. Raw session material never crosses the bridge.

Successful provider onboarding moves public state to `sync_ready` with safe summaries only:

```js
{
  ok: true,
  nextStatus: "sync_ready",
  profile: { id, displayName, avatarColor, onboardingCompleted, createdAt, updatedAt },
  workspace: { id, name, role, createdAt, updatedAt }
}
```

The public runtime and snapshot may contain the same safe profile/workspace summaries, masked email/user diagnostics, `sessionExpiresAt`, `onboardingCompleted: true`, and `syncReady: true`. They must not contain raw provider responses, raw session, token fields, raw user objects, raw config, `owner_user_id`, or `deleted_at`.

Failure responses remain normalized:

```js
{ ok: false, nextStatus: "auth_error", errorCode, errorMessage }
```

Allowed errors are `identity/onboarding-invalid-input`, `identity/onboarding-session-missing`, `identity/network-not-ready`, `identity/onboarding-rejected`, `identity/onboarding-conflict`, `identity/onboarding-network-failed`, `identity/onboarding-provider-unavailable`, `identity/onboarding-response-malformed`, and `identity/onboarding-failed`.

## 15.13 Phase 3.4C - Session Lifecycle UX Decision

Phase 3.4C chooses the session-only model for the current browser extension phase. Raw provider session material remains only in `chrome.storage.session[h2oIdentityProviderSessionV1]`. If the browser or extension lifecycle clears `chrome.storage.session`, the user returns to the safe signed-out/local state and may need to request a new email code.

This phase is copy, documentation, and validator coverage only. It does not add persistent sign-in behavior, does not add a "keep me signed in" checkbox, does not write provider tokens or sessions to `chrome.storage.local`, does not change provider refresh or sign-out semantics, and does not change SQL, manifest permissions, CSP, packages, loader behavior, background auth ownership, or page-side identity APIs.

The approved UX copy explains that provider sessions and tokens stay background-owned and session-only for now. Onboarding and Account surfaces may state that account profile and workspace data are synced for the current browser session, and that a browser or extension restart may require a new email code.

Persistent sign-in remains deferred to a future dedicated architecture/security phase. A future opt-in remember-device design must be separately approved before any refresh token is persisted. That future phase must define a dedicated storage key/schema, persist no access token, clear persisted material on sign-out, keep token material background-owned, and add validators proving no provider token/session material reaches page storage, public snapshots, UI, loader, web-accessible resources, or unapproved `chrome.storage.local` keys.

## 15.14 Phase 3.4D - Stable Baseline

Phase 3.4D is a final stabilization checkpoint before any future persistent sign-in architecture work. It adds no runtime behavior, no provider/background auth changes, no SQL/RLS changes, no loader changes, no UI behavior changes, no manifest/CSP/permission changes, no package changes, and no persistence. The approved session policy remains unchanged: raw provider session material may exist only in `chrome.storage.session[h2oIdentityProviderSessionV1]`, persistent refresh-token storage is deferred, and no "keep me signed in" behavior exists.

Active build checklist:

```sh
node tools/product/extension/build-chrome-live-extension.mjs
env H2O_EXT_DEV_VARIANT=lean H2O_EXT_OUT_DIR=build/chrome-ext-dev-lean node tools/product/extension/build-chrome-live-extension.mjs
env H2O_EXT_DEV_VARIANT=production H2O_EXT_OUT_DIR=build/chrome-ext-prod node tools/product/extension/build-chrome-live-extension.mjs
env H2O_IDENTITY_PHASE_NETWORK=request_otp H2O_EXT_OUT_DIR=build/chrome-ext-dev-controls-armed node tools/product/extension/build-chrome-live-extension.mjs
node tools/dev-controls/ops-panel/make-chrome-ops-panel-extension.mjs
```

Active validator checklist:

```sh
node tools/validation/identity/validate-identity-background-bundle.mjs
node tools/validation/identity/validate-identity-phase3_0q.mjs
node tools/validation/identity/validate-identity-phase3_2b-schema.mjs
node tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs
node tools/validation/identity/validate-identity-phase3_3a-ui.mjs
node tools/validation/identity/validate-identity-phase3_3b-ui.mjs
node tools/validation/identity/validate-identity-phase3_3c-ui-edge-cases.mjs
node tools/validation/identity/validate-identity-phase3_4c-session-ux.mjs
node tools/validation/identity/validate-identity-phase3_4d-baseline.mjs
node tools/validation/onboarding/validate-onboarding-open.mjs
node tools/validation/identity/validate-identity-phase2_9.mjs
node tools/validation/identity/validate-identity-phase2_9-sync.mjs
```

`tools/validation/onboarding/validate-onboarding-url.mjs` remains a legacy reference for the older URL-resolution path and is not part of the active 3.4D checklist. The active onboarding-open validator is `tools/validation/onboarding/validate-onboarding-open.mjs`, which checks the current `identity:open-onboarding` bridge and background `chrome.windows.create` flow.

`tools/validation/identity/validate-identity-phase3_0q.mjs` is expected to warn for the default development controls/lean profiles: broad dev-only host permissions and the dev controls wildcard external-connectable baseline. These warnings are not accepted for production or for the armed request-OTP profile. The armed request-OTP manifest must remain limited to `https://chatgpt.com/*` plus the local proxy origin in required `host_permissions`, and exactly one Supabase project origin in `optional_host_permissions`. Production must remain unarmed and narrow with only `https://chatgpt.com/*`.

Stable security baseline:

| Assertion |
|---|
| No service-role key appears in extension runtime or generated extension outputs. |
| No `access_token`, `refresh_token`, raw session, raw user, raw config, `owner_user_id`, or `deleted_at` appears in UI/page/loader/public identity state. |
| No Supabase SDK, `.rpc(...)`, `.from(...)`, provider bundle import, or raw provider config appears in page/UI/loader code. |
| Provider bundle owns approved Supabase calls. |
| Background owns raw provider session material. |
| `chrome.storage.session` is the only provider session store. |
| `chrome.storage.local` is not used for provider token/session persistence. |
| No "keep me signed in" behavior exists. |
| Session-only UX copy exists. |
| Armed optional Supabase host access remains exact-project only; no wildcard Supabase permission or broad all-host permission is allowed in the armed profile. |

Manual armed-browser baseline:

1. Reload `build/chrome-ext-dev-controls-armed`.
2. Confirm provider readiness and exact optional permission readiness.
3. Request OTP from the onboarding UI.
4. Verify OTP from the onboarding UI.
5. Confirm the UI reaches `sync_ready`.
6. Confirm the Account tab shows account ready/synced and session-only copy.
7. Reload ChatGPT while `chrome.storage.session` still contains the provider session and confirm `sync_ready` restores.
8. Open onboarding while `sync_ready` and confirm it does not re-submit or write onboarding data.
9. Sign out and confirm public state returns to `anonymous_local`.
10. Confirm `chrome.storage.session.get("h2oIdentityProviderSessionV1")` returns `{}`.
11. Confirm page state, public snapshots, diagnostics, and ChatGPT storage expose no token/session/raw-user/raw-config fields.

## 15.15 Phase 3.5A - Persistent Sign-In Architecture Review

Phase 3.5A is architecture and security review only. It does not implement persistence, does not store refresh tokens, does not add a "keep me signed in" checkbox, does not change runtime behavior, and does not weaken the current session-only validators.

Decision: keep the current session-only model unless product UX explicitly requires persistent sign-in. If persistent sign-in is later approved, it must be opt-in only, never default-on, and must persist only a refresh token under a dedicated background-owned key. Access tokens, full provider sessions, raw users, raw emails, raw config, and provider response bodies must never be persisted.

This review decision was superseded by Phase 3.7A approval for product UX: 3.7A removes the opt-in checkbox proposal and keeps persistent sign-in default-on only for real provider-backed Supabase identity. The hard security boundary remains unchanged: refresh token only, no access token, no full session, no raw user, no raw config, and no page/UI/loader exposure.

Threat model:

| Risk | Policy |
|---|---|
| A persisted refresh token can mint new sessions. | Treat it as credential material and keep it background-owned. |
| `chrome.storage.local` is extension-scoped but not OS keychain-grade encrypted storage. | Use it only after explicit opt-in and only for the dedicated refresh-token record. |
| Page or loader compromise must not see provider credentials. | Never expose token material to page/UI/loader, public snapshots, diagnostics, or web-accessible resources. |
| Refresh-token rotation can invalidate old tokens. | Replace the stored refresh token atomically after each successful provider refresh. |
| Restore failure could leave stale credentials. | Clear the persistent record on invalid, malformed, or rejected refresh-token restore. |

Approved persistent mode schema, implemented in Phase 3.7A:

```js
// chrome.storage.local[h2oIdentityProviderPersistentRefreshV1]
{
  version: 1,
  provider: "supabase",
  providerKind: "supabase",
  projectOrigin: "https://<project-ref>.supabase.co",
  refresh_token: "<opaque refresh token>",
  createdAt: "<ISO timestamp>",
  updatedAt: "<ISO timestamp>",
  lastRotatedAt: "<ISO timestamp|null>"
}
```

Startup restore order for the approved implementation:

1. Prefer the current `chrome.storage.session[h2oIdentityProviderSessionV1]` path when it exists and is valid.
2. If session storage is empty and the persistent record exists, require provider config, exact host permission, client readiness, network readiness, and exact project-origin match.
3. Validate record version, provider, project origin, and refresh-token shape.
4. Call the existing background-owned provider refresh helper with the persisted refresh token.
5. Store the returned full raw session only in `chrome.storage.session`.
6. Replace `h2oIdentityProviderPersistentRefreshV1` with the rotated refresh token from the provider response.
7. Publish only safe provider-backed public state and call `load_identity_state` to restore `sync_ready` when profile/workspace rows exist.

Sign-out must clear runtime state, public snapshots, `h2oIdentityProviderSessionV1`, and `h2oIdentityProviderPersistentRefreshV1`. Provider `signOut({ scope: "local" })` remains best-effort and must never block local cleanup.

The prior default-off checkbox proposal is not implemented in 3.7A:

> Keep me signed in on this browser

Supporting copy:

> Stores a provider refresh credential in this extension's local storage so H2O can restore your session after browser restart. Use only on a private device.

No "keep me signed in" checkbox is added. OTP code, raw email, raw provider errors, tokens, sessions, and raw users must not be written to page storage or public snapshots.

Future validator gates before implementation:

| Gate |
|---|
| `chrome.storage.local` may store provider credential material only under `h2oIdentityProviderPersistentRefreshV1`. |
| The persistent record may contain only `refresh_token` and safe metadata; no `access_token`, full session, raw user, raw email, raw config, or provider response body. |
| Persistent restore uses the provider bundle refresh helper only; no provider `getSession`, SDK `persistSession`, SDK `autoRefreshToken`, or page-side Supabase. |
| Sign-out clears the persistent key. |
| UI/page/loader remain free of Supabase SDK, `.rpc(...)`, `.from(...)`, provider bundle imports, service-role strings, and token/session fields. |
| Persistent sign-in is default-on only for real provider-backed Supabase identity; mock/local-only flows must never create, read, or use `h2oIdentityProviderPersistentRefreshV1`. |

Manual test plan for a future implementation:

1. Opt-in unchecked: browser or extension restart returns to anonymous/local.
2. Opt-in checked: restart restores provider-backed `sync_ready` through refresh plus `load_identity_state`.
3. Inspect `chrome.storage.local` and confirm only the dedicated refresh record exists, with no access token, full session, raw user, or raw config.
4. Confirm refresh-token rotation updates the persistent refresh record.
5. Confirm sign-out removes both session and persistent keys.
6. Confirm invalid persisted tokens fail closed and clear persistent state.
7. Confirm permission or network unavailability does not expose raw provider errors or token material.
8. Confirm public/page state remains token-free in all flows.

`tools/validation/identity/validate-identity-phase3_5a-persistence-review.mjs` is a static review validator for this phase. It verifies that the decision record exists, the future storage schema is documented, and current runtime/UI/loader/background code still has no persistent sign-in behavior.

Static review command:

```sh
node tools/validation/identity/validate-identity-phase3_5a-persistence-review.mjs
```

## 15.16 Phase 3.5B - Identity Release Gate

Phase 3.5B is a release-gate checklist for the current identity stack and now covers the current Phase 4.0B Account & Security MVP policy. Persistent sign-in is implemented in Phase 3.7A for real provider-backed Supabase identity, with Phase 3.7B production-minimal bridge responses, Phase 3.8A email/password auth, Phase 3.8B separated auth UX, Phase 3.8C account-creation confirmation, Phase 3.8D email-code recovery with mandatory set-password before ready, Phase 3.8E durable password integrity gating, Phase 3.8F final password-auth release-gate documentation, Phase 3.9B Google OAuth, Phase 3.9C Google OAuth release-gate documentation, and Phase 4.0B account/security management for safe profile edit, workspace rename, credential display, and signed-in password change. The persistent record is refresh token only, with no access token, no full raw session, no raw user, no raw email, no raw config, no password, no provider token, no provider refresh token, and no provider response body. Active provider session material may still exist only in `chrome.storage.session[h2oIdentityProviderSessionV1]`.

Final release-gate build commands:

```sh
node tools/product/extension/build-chrome-live-extension.mjs
env H2O_EXT_DEV_VARIANT=lean H2O_EXT_OUT_DIR=build/chrome-ext-dev-lean node tools/product/extension/build-chrome-live-extension.mjs
env H2O_EXT_DEV_VARIANT=production H2O_EXT_OUT_DIR=build/chrome-ext-prod node tools/product/extension/build-chrome-live-extension.mjs
env H2O_IDENTITY_PHASE_NETWORK=request_otp H2O_EXT_OUT_DIR=build/chrome-ext-dev-controls-armed node tools/product/extension/build-chrome-live-extension.mjs
env H2O_IDENTITY_PHASE_NETWORK=request_otp H2O_IDENTITY_OAUTH_PROVIDER=google H2O_EXT_OUT_DIR=build/chrome-ext-dev-controls-oauth-google node tools/product/extension/build-chrome-live-extension.mjs
node tools/dev-controls/ops-panel/make-chrome-ops-panel-extension.mjs
```

Final release-gate validator commands:

```sh
node tools/validation/identity/validate-identity-background-bundle.mjs
node tools/validation/identity/validate-identity-phase3_0q.mjs
node tools/validation/identity/validate-identity-phase3_2b-schema.mjs
node tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs
node tools/validation/identity/validate-identity-phase3_3a-ui.mjs
node tools/validation/identity/validate-identity-phase3_3b-ui.mjs
node tools/validation/identity/validate-identity-phase3_3c-ui-edge-cases.mjs
node tools/validation/identity/validate-identity-phase3_4c-session-ux.mjs
node tools/validation/identity/validate-identity-phase3_4d-baseline.mjs
node tools/validation/identity/validate-identity-phase3_5a-persistence-review.mjs
node tools/validation/identity/validate-identity-phase3_5b-release-gate.mjs
node tools/validation/identity/validate-identity-phase3_7a-persistent-signin.mjs
node tools/validation/identity/validate-identity-phase3_7b-production-polish.mjs
node tools/validation/identity/validate-identity-phase3_8a-password-auth.mjs
node tools/validation/identity/validate-identity-phase3_8b-auth-ux-separation.mjs
node tools/validation/identity/validate-identity-phase3_8c-account-verification.mjs
node tools/validation/identity/validate-identity-phase3_8d-email-code-recovery.mjs
node tools/validation/identity/validate-identity-phase3_8e-password-integrity.mjs
node tools/validation/identity/validate-identity-phase3_8f-password-auth-release-gate.mjs
node tools/validation/identity/validate-identity-phase3_9b-google-oauth.mjs
node tools/validation/identity/validate-identity-phase3_9c-google-oauth-release-gate.mjs
node tools/validation/identity/validate-identity-phase4_0b-account-security-mvp.mjs
node tools/validation/onboarding/validate-onboarding-open.mjs
node tools/validation/identity/validate-identity-phase2_9.mjs
node tools/validation/identity/validate-identity-phase2_9-sync.mjs
```

Generated syntax-check commands:

```sh
node --check tools/validation/identity/validate-identity-phase3_5b-release-gate.mjs
node --check tools/validation/identity/validate-identity-phase3_7a-persistent-signin.mjs
node --check tools/validation/identity/validate-identity-phase3_7b-production-polish.mjs
node --check tools/validation/identity/validate-identity-phase3_8a-password-auth.mjs
node --check tools/validation/identity/validate-identity-phase3_8b-auth-ux-separation.mjs
node --check tools/validation/identity/validate-identity-phase3_8c-account-verification.mjs
node --check tools/validation/identity/validate-identity-phase3_8d-email-code-recovery.mjs
node --check tools/validation/identity/validate-identity-phase3_8e-password-integrity.mjs
node --check tools/validation/identity/validate-identity-phase3_8f-password-auth-release-gate.mjs
node --check tools/validation/identity/validate-identity-phase3_9b-google-oauth.mjs
node --check tools/validation/identity/validate-identity-phase3_9c-google-oauth-release-gate.mjs
node --check tools/validation/identity/validate-identity-phase4_0b-account-security-mvp.mjs
node --check scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js
node --check build/chrome-ext-dev-controls/bg.js
node --check build/chrome-ext-dev-controls/loader.js
node --check build/chrome-ext-dev-controls/popup.js
node --check build/chrome-ext-dev-controls/provider/identity-provider-supabase.js
node --check build/chrome-ext-dev-lean/bg.js
node --check build/chrome-ext-dev-lean/loader.js
node --check build/chrome-ext-dev-lean/provider/identity-provider-supabase.js
node --check build/chrome-ext-prod/bg.js
node --check build/chrome-ext-prod/loader.js
node --check build/chrome-ext-prod/provider/identity-provider-supabase.js
node --check build/chrome-ext-dev-controls-armed/bg.js
node --check build/chrome-ext-dev-controls-armed/loader.js
node --check build/chrome-ext-dev-controls-armed/popup.js
node --check build/chrome-ext-dev-controls-armed/provider/identity-provider-supabase.js
node --check build/chrome-ext-dev-controls-oauth-google/bg.js
node --check build/chrome-ext-dev-controls-oauth-google/loader.js
node --check build/chrome-ext-dev-controls-oauth-google/popup.js
node --check build/chrome-ext-dev-controls-oauth-google/provider/identity-provider-supabase.js
node --check build/chrome-ext-ops-panel/panel.js
```

Live RLS release-gate instructions:

`tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs` remains opt-in and skips by default. Run it live only against a dev or disposable Supabase project, never production. Required live environment:

| Env var |
|---|
| `H2O_SUPABASE_RLS_LIVE=1` |
| `H2O_SUPABASE_TEST_URL` |
| `H2O_SUPABASE_TEST_ANON_KEY` |
| `H2O_SUPABASE_TEST_SERVICE_ROLE_KEY` |

Optional live behavior:

| Env var |
|---|
| `H2O_SUPABASE_RLS_LIVE_REQUIRED=1` |
| `H2O_SUPABASE_TEST_USER_A_EMAIL` |
| `H2O_SUPABASE_TEST_USER_A_PASSWORD` |
| `H2O_SUPABASE_TEST_USER_B_EMAIL` |
| `H2O_SUPABASE_TEST_USER_B_PASSWORD` |
| `H2O_SUPABASE_RLS_PRIVILEGE_FALLBACK_CONFIRMED=1` |
| `H2O_SUPABASE_RLS_ANON_CAN_EXECUTE=false` |
| `H2O_SUPABASE_RLS_AUTHENTICATED_CAN_EXECUTE=true` |

The service-role key is allowed only in this live harness environment for creating and cleaning up disposable users. It must never appear in extension source, generated extension output, UI, loader, public snapshots, or committed config.

Manual armed-browser release checklist:

1. Load `build/chrome-ext-dev-controls-armed`.
2. Grant the exact Supabase optional permission if needed.
3. New email -> email-code sign-in -> "No account found."
4. Create account weak password -> local block.
5. Create account mismatch -> local block.
6. Create account strong password -> confirmation path.
7. Confirmation code/link path -> session starts or safe pending state.
8. Password sign-in -> `sync_ready`.
9. Wrong password -> safe error plus recovery action.
10. Recovery code -> `password_update_required`.
11. Weak/mismatch new password -> local block.
12. Strong new password -> `credentialState` complete plus `sync_ready`.
13. Chrome restart -> `sync_ready` restored.
14. Sign out -> all credential keys removed.
15. Public leak check -> all sensitive fields false.
16. Live RLS password-status checks pass.
17. Confirm Account tab shows `provider_backed`, `supabase`, account ready/synced, and `Credential: Password set`.
18. Confirm `chrome.storage.session.get("h2oIdentityProviderSessionV1")` exists only while signed in and returns `{}` after sign-out.
19. Confirm `chrome.storage.local.get("h2oIdentityProviderPersistentRefreshV1")` contains only `refresh_token` plus safe metadata while signed in, and no `access_token`, full session, raw user, raw email, raw config, provider response body, or password.
20. Confirm sign-out removes `chrome.storage.local["h2oIdentityProviderPersistentRefreshV1"]` and `chrome.storage.local["h2oIdentityProviderPasswordUpdateRequiredV1"]`.
21. Build `build/chrome-ext-dev-controls-oauth-google` with `H2O_IDENTITY_OAUTH_PROVIDER=google`, confirm its manifest alone includes the `identity` permission, and confirm `chrome.identity.getRedirectURL("identity/oauth/google")` matches a Supabase Redirect URL.
22. New Google user -> Continue with Google -> profile/onboarding if no rows exist -> `sync_ready` after onboarding.
23. Returning Google user -> Continue with Google -> `sync_ready`; Chrome restart restores through the Supabase refresh-token-only persistent record.
24. OAuth cancel, redirect mismatch, provider-disabled, and network failures show safe errors and do not expose raw OAuth responses.
25. OAuth storage scan confirms no `provider_token`, no `provider_refresh_token`, no access token, no full raw session, and no raw user in public state or `chrome.storage.local`.

Known limitations and deferred work:

| Item | Status |
|---|---|
| Session persistence | Persistent sign-in is implemented in Phase 3.7A for real provider-backed Supabase identity. |
| Persistent sign-in UI | No "keep me signed in" checkbox exists; persistence is default-on only for real provider-backed Supabase identity. |
| Provider token persistence | `chrome.storage.local` may contain only `h2oIdentityProviderPersistentRefreshV1` with refresh token plus safe metadata. Access tokens and full sessions remain forbidden. |
| Live RLS validation | Requires a dev/disposable Supabase project and service-role env only for the harness; not production. |
| Reset password completion | Reset password remains request-only; reset-link completion remains deferred. |
| Change password settings | Signed-in password change is implemented in Phase 4.0B for password-backed accounts; Google-only add-password and broader credential management remain deferred. |
| Google OAuth | Google OAuth is implemented behind explicit `H2O_IDENTITY_OAUTH_PROVIDER=google` builds only. |
| Microsoft/GitHub/Apple OAuth | Microsoft/GitHub/Apple OAuth/social login remains deferred until separate approved identity tracks. |
| MFA | MFA remains deferred. |
| Account deletion/session management | Account deletion/session management remains deferred. |
| Production migration rollout | Production migration rollout still needs an explicit deployment gate. |
| Legacy onboarding URL validator | `tools/validation/onboarding/validate-onboarding-url.mjs` remains a legacy reference only; `tools/validation/onboarding/validate-onboarding-open.mjs` is active. |
| System connectors quota error | The ChatGPT/page `system-connectors` `QuotaExceededError` is a separate follow-up and not part of identity 3.5B. |

Release-blocking assertions:

| Assertion |
|---|
| Armed request-OTP build has no CSP, no wildcard hosts, Supabase only in exact-project optional host permission, and no wildcard `externally_connectable` ids. |
| Production build has no CSP, no optional Supabase permission, no wildcard hosts, and only `https://chatgpt.com/*` in `host_permissions`. |
| Page/UI/loader have no Supabase SDK import, `.rpc(...)`, `.from(...)`, provider bundle import, service-role string, or token/session/raw-user exposure. |
| Background remains the only owner of raw provider session material. |
| Provider bundle remains the only owner of approved Supabase SDK calls. |
| Google OAuth uses `chrome.identity.launchWebAuthFlow` in background only, `signInWithOAuth`/`exchangeCodeForSession` in provider bundle only, and no provider token persistence. |
| `validate-identity-phase3_0q.mjs` dev warnings remain documented and are accepted only for dev controls/lean, not production or armed release-gate safety. |

`tools/validation/identity/validate-identity-phase3_5b-release-gate.mjs` is the static release-gate validator for this phase. It verifies this checklist is documented and that the current generated release surfaces still satisfy the provider-owned auth boundary, refresh-token-only persistence boundary, and Google-OAuth-only rollout gate.

## 15.17 Phase 3.6A - Production Readiness Review Outcome

Phase 3.6A is a production-readiness and security-hardening review of the current identity stack. At the time of review it added no runtime behavior, no provider/background/auth changes, no SQL/RLS changes, no UI behavior changes, no manifest/CSP/permission changes, no package changes, no persistence, and no "keep me signed in" behavior.

Decision: the current session-only identity stack is ready as a stable milestone with conditions. It is not product-complete. Persistent sign-in remains required for practical production UX and is the next major identity architecture and implementation track after this release-runner/checklist phase.

Persistent sign-in was implemented in Phase 3.7A after this review. The 3.6A security conclusions still apply, but the current release gate must now include the 3.7A persistent-refresh validator and manual checks.

Ready-with-conditions means:

| Condition |
|---|
| The full Phase 3.5B release-gate build, validator, and syntax suite passes immediately before tagging. |
| The live RLS harness passes against the intended dev or staging Supabase project before production migration or rollout decisions. |
| The manual armed-browser release checklist passes with the target dev/staging provider config and exact optional permission. |
| Production DB migration/deployment remains a separate explicit gate. |
| Profile/workspace editing, local-to-cloud migration, multi-workspace/invites/roles, and the unrelated `system-connectors` `QuotaExceededError` remain deferred. |

Phase 3.7B supersedes the temporary public diagnostics allowance. Production bridge responses are minimal in all builds. Internal diagnostic helpers may remain for validator fixtures and private control-flow decisions, but they must not cross the bridge or enter page/UI state.

## 15.18 Phase 3.6B - Identity Release Runner

Phase 3.6B adds a convenience runner for the existing release gate. The runner does not replace the explicit Phase 3.5B command list; it executes that list in grouped order and exits nonzero on the first failure.

Runner command:

```sh
node tools/validation/identity/run-identity-release-gate.mjs
```

Runner behavior:

| Behavior |
|---|
| Runs the five Phase 3.5B build commands. |
| Runs the active identity validators through Phase 3.7B. |
| Leaves `tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs` skip-by-default behavior unchanged unless live RLS env vars are present. |
| Runs the generated syntax-check commands after builds. |
| Prints grouped command output and exits nonzero on the first failed command. |
| Does not edit source files, apply migrations, write secrets, store tokens, change runtime behavior, change manifests, and does not require live Supabase credentials. |

The runner may regenerate ignored build outputs as part of the existing release-gate build steps. It must not introduce package scripts, persistence behavior, provider session storage changes, page-side Supabase, SQL/RLS changes, or UI behavior changes.

## 15.19 Phase 3.7A - Persistent Sign-In Implementation

Phase 3.7A implements default-on persistent sign-in only for real provider-backed Supabase identity. It does not add page-side Supabase, does not change SQL/RLS, does not change manifest/CSP/permissions, does not add password or OAuth providers, and does not expose provider credential material to page/UI/loader/public state.

Approved storage policy:

| Store | Key | Contents | Owner |
|---|---|---|---|
| `chrome.storage.session` | `h2oIdentityProviderSessionV1` | Active raw Supabase session for the current browser session. | Background only |
| `chrome.storage.local` | `h2oIdentityProviderPersistentRefreshV1` | Supabase refresh token only plus safe metadata. | Background only |

Persistent record schema:

```js
{
  version: 1,
  provider: "supabase",
  providerKind: "supabase",
  projectOrigin: "https://<project-ref>.supabase.co",
  refresh_token: "<opaque refresh token>",
  createdAt: "<ISO timestamp>",
  updatedAt: "<ISO timestamp>",
  lastRotatedAt: "<ISO timestamp|null>"
}
```

Never persist `access_token`, a full raw session, raw user, raw email, raw config, provider response bodies, service-role material, or Supabase anon/private config in `chrome.storage.local`. The active raw session remains session-owned and must never fall back to `chrome.storage.local`.

Persistence gates:

| Gate |
|---|
| Provider config must validate as Supabase/provider-backed. |
| The build must have real injected Supabase provider config, not mock/local-only config. |
| Exact project origin must be known from private provider config. |
| The exact Supabase optional host origin must match the stored record project origin. |
| Startup restore requires provider configured, client ready, permission ready, phase network enabled, and network ready. |
| mock/local-only flows must never create, read, or use `h2oIdentityProviderPersistentRefreshV1`. |

Lifecycle:

1. OTP verify success stores the full active provider session only in `chrome.storage.session[h2oIdentityProviderSessionV1]`.
2. The same verify success stores only the normalized refresh-token record in `chrome.storage.local[h2oIdentityProviderPersistentRefreshV1]` when the real Supabase gates pass.
3. Wake/restore first prefers the active session-storage path.
4. If the active session key is missing and the persistent record exists, restore validates record shape, provider/project origin, permission, client, and network readiness before calling the existing provider `refreshProviderSession` helper.
5. Successful persistent restore writes the returned full raw session only to `chrome.storage.session`, rotates the persistent refresh-token record, publishes safe provider-backed state, and calls `load_identity_state` through the existing read-only restore path.
6. Lazy refresh rotates `h2oIdentityProviderPersistentRefreshV1` only when a valid persistent record already exists.
7. Sign-out always removes both `h2oIdentityProviderSessionV1` and `h2oIdentityProviderPersistentRefreshV1`.
8. Malformed, project-mismatched, invalid, revoked, or provider-rejected persistent refresh tokens clear the persistent record and fail closed. Permission or network-not-ready restore is retryable and keeps the record without exposing token material.

UI policy:

| Surface | Copy |
|---|---|
| Onboarding | "You stay signed in on this browser until you sign out or your session is revoked." |
| Account tab | "Provider sessions and tokens stay background-owned." |

There is no "keep me signed in" checkbox in 3.7A. Persistent sign-in is default-on only for real provider-backed Supabase identity because practical production UX requires restart restore. Users can clear the persistent refresh credential through sign-out.

Manual 3.7A browser checklist:

1. Load `build/chrome-ext-dev-controls-armed`.
2. Grant the exact Supabase optional permission if needed.
3. Sign in with OTP and reach `sync_ready`.
4. Confirm `chrome.storage.session.get("h2oIdentityProviderSessionV1")` has the active session while signed in.
5. Confirm `chrome.storage.local.get("h2oIdentityProviderPersistentRefreshV1")` has `refresh_token` plus safe metadata only.
6. Confirm the persistent record has no `access_token`, full session, raw user, raw email, raw config, or provider response body.
7. Clear session storage or restart Chrome, then open ChatGPT and confirm automatic restore to `sync_ready` without OTP.
8. Confirm public/page state has no token/session/raw-user fields.
9. Trigger lazy refresh and confirm the persistent refresh record rotates safely.
10. Sign out and confirm both provider keys are removed.
11. Restart Chrome again and confirm the user remains signed out.
12. Corrupt the persistent refresh token and confirm restore fails closed and clears the persistent key.
13. Run mock/local flow and confirm `h2oIdentityProviderPersistentRefreshV1` is never created.

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_7a-persistent-signin.mjs
```

## 15.20 Phase 3.7B - Persistent Sign-In Production Polish

Phase 3.7B keeps the Phase 3.7A persistent sign-in behavior and removes temporary diagnostics from public bridge responses. Public bridge responses are production-minimal in every build; diagnostics remain internal and validator-guarded.

Production public response policy:

| Response | Public shape |
|---|---|
| OTP verify success | Safe verification fields only; no `persistentSignInDiagnostics`. |
| Sign-out success | `{ ok: true, nextStatus: "anonymous_local" }` |
| Sign-out failure | Generic `identity/sign-out-failed` response only; no cleanup diagnostics. |
| Onboarding session-missing failure | Generic safe error fields only; no session-shape diagnostic booleans or key names. |

Internal checks remain required:

| Check |
|---|
| OTP verify still stores the active session in `chrome.storage.session` and the refresh-token-only record in `chrome.storage.local`. |
| Sign-out still removes and verifies absence of both `h2oIdentityProviderSessionV1` and `h2oIdentityProviderPersistentRefreshV1`. |
| Restore, refresh, raw session writes, and persistent refresh writes remain suppressed during sign-out cleanup. |
| UI/page/loader still receive no token, session, raw user, raw config, `owner_user_id`, or `deleted_at` fields. |

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_7b-production-polish.mjs
```

## 15.21 Phase 3.8A - Email and Password Auth

Phase 3.8A adds Supabase email/password sign-up, sign-in, and password reset request while preserving the existing provider/background ownership boundary. OTP remains supported. OAuth, password reset completion through link parsing, recovery-token parsing, and general profile password change remain deferred to separate approved phases. Phase 3.8D later approves one narrow exception: provider-owned `updateUser({ password })` only for a verified email-code recovery session.

Provider/password boundary:

| Boundary | Policy |
|---|---|
| Provider bundle | Owns `client.auth.signUp`, `client.auth.signInWithPassword`, and `client.auth.resetPasswordForEmail`. |
| Background | Owns bridge actions, raw session storage, persistent refresh-token storage, and cloud identity restore. |
| Page/UI | Uses `H2O.Identity` facade methods and bridge actions only. |
| Password value | May exist only in temporary form state and the one bridge request needed to authenticate. |
| Persistent sign-in | Reuses the Phase 3.7A refresh-token-only record after password sign-up/sign-in returns a real provider session. |

Password reset is request-only in Phase 3.8A. The extension does not parse recovery links, does not handle redirect tokens, and does not create a recovery session. `updateUser` is not used for reset-link completion; the only approved `updateUser({ password })` call is the later Phase 3.8D provider-owned recovery-code set-password helper.

Safe public responses:

| Flow | Public behavior |
|---|---|
| Password sign-up/sign-in with session | Publishes safe `verified_no_profile` or `sync_ready` state after `load_identity_state`. |
| Password sign-up requiring email confirmation | Returns safe `email_confirmation_pending`; no fake provider session and no persistent credential. |
| Password reset request | Returns safe `password_reset_email_sent`; no session or persistent credential. |
| Failures | Return safe `auth_error` fields only. |

Passwords, access tokens, refresh tokens, full provider sessions, raw users, raw config, raw provider errors, `owner_user_id`, and `deleted_at` must never cross into page/public state, snapshots, diagnostics, localStorage, sessionStorage, or bridge responses.

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_8a-password-auth.mjs
```

The release runner includes the 3.8A validator:

```sh
node tools/validation/identity/run-identity-release-gate.mjs
```

## 15.22 Phase 3.8B - Auth UX Separation

Phase 3.8B separates authentication into explicit Sign in, Create account, and Reset password paths. Account creation requires a password in this phase. OAuth/social providers remain deferred, and password reset remains request-only.

Email-code authentication is now passwordless sign-in for existing accounts only. The provider OTP helper calls `signInWithOtp` with `shouldCreateUser:false`, so email-code sign-in must not silently create a new Supabase account. A missing account returns the safe `identity/account-not-found` response with user copy: "No account found. Create an account first."

Auth path policy:

| Path | Behavior |
|---|---|
| Sign in | Supports email/password and email-code sign-in for existing accounts. |
| Create account | Requires email, password, and password confirmation; routes only through password sign-up. |
| Reset password | Sends a reset request only; no recovery-link parsing, recovery session, or reset-link password change. |
| Email confirmation | If password sign-up returns no session, the UI shows confirmation-pending only and stores no credentials. |

Security boundaries remain unchanged: provider bundle owns Supabase auth calls, background owns active session and persistent refresh-token-only storage, UI uses the `H2O.Identity` facade only, and passwords/OTP codes/tokens/raw sessions/raw users never enter snapshots, diagnostics, localStorage, sessionStorage, or public bridge responses.

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_8b-auth-ux-separation.mjs
```

The release runner includes the 3.8B validator:

```sh
node tools/validation/identity/run-identity-release-gate.mjs
```

## 15.23 Phase 3.8C - Account Creation Verification

Phase 3.8C completes the account-creation verification model for email/password auth. Create account requires email, password, and confirm password. Email-code sign-in remains existing-user-only through `shouldCreateUser:false`; it must not create accounts silently.

Provider confirmation policy:

| Flow | Behavior |
|---|---|
| Password sign-up returns a session | Background stores the active raw session in `chrome.storage.session` and stores only the refresh token record in `chrome.storage.local`. |
| Password sign-up returns `session:null` | Background publishes safe `email_confirmation_pending` state only. No active session and no persistent refresh credential are stored. |
| Signup confirmation code | Provider bundle calls `verifyOtp` with `type:"email"`. Only a real returned session can create active/persistent credentials. |
| Resend confirmation | Provider bundle calls `auth.resend` with `type:"signup"`. Resend never creates active or persistent credentials. |
| Confirmation link email | The UI tells the user to confirm the link, then sign in. The extension does not parse redirect tokens or recovery links. |

Password UX policy:

| Requirement | Current behavior |
|---|---|
| Minimum length | Create-account UI requires at least 12 characters before the provider call. |
| Confirmation | Create-account UI requires password confirmation match before the provider call. |
| Show/hide controls | Password and confirm-password fields have transient show/hide buttons; values remain form memory only. |
| Weak password handling | UI blocks obviously weak, email-equal, common, repeated-character, and one-character-type passwords; Supabase remains source of truth. |
| Reset password | Reset request lives under the Sign in password area and remains request-only. No reset-link `updateUser`, recovery-session parsing, or redirect-token handling. |

Security boundaries remain unchanged: provider bundle owns Supabase auth calls, background owns raw sessions and refresh-token-only persistence, UI uses `H2O.Identity` facade and bridge actions only, and passwords/OTP codes/tokens/raw sessions/raw users never enter snapshots, diagnostics, localStorage, sessionStorage, or public bridge responses.

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_8c-account-verification.mjs
```

The release runner includes the 3.8C validator:

```sh
node tools/validation/identity/run-identity-release-gate.mjs
```

## 15.24 Phase 3.8D - Email-Code Recovery and Set Password

Phase 3.8D adds a separate wrong-password recovery flow. Normal email-code sign-in remains an existing-user-only passwordless sign-in path. As of Phase 3.8E, it may restore `sync_ready` only when `credentialState` is complete. Recovery email-code verification is different: it publishes `password_update_required`, stores a minimal recovery marker, and requires the user to set a new password before the UI can return to ready state.

Recovery flow policy:

| Step | Behavior |
|---|---|
| Wrong password | UI shows safe "Email or password did not match" copy and a recovery action. |
| Recovery code request | Background calls the existing provider OTP request path, which uses `signInWithOtp` with `shouldCreateUser:false`. |
| Recovery code verification | Provider bundle calls `verifyOtp` with `type:"email"` and must return a real session before any active or persistent credential is written. |
| Verified recovery session | Background stores the active raw session only in `chrome.storage.session`, stores the refresh-token-only persistent record, writes the minimal password-update-required marker, and publishes `password_update_required`, not `sync_ready`. |
| Set new password | Provider bundle owns the only approved `client.auth.updateUser({ password })` call through `updatePasswordAfterRecovery`. Background passes the background-owned raw session to that helper and never calls Supabase directly. |
| Update success | Background clears the marker, runs the existing safe cloud restore path, and may publish `sync_ready` when `load_identity_state` returns profile/workspace. |
| Restart before password update | Persistent restore honors the marker and restores `password_update_required` until the password update succeeds or the user signs out. |
| Onboarding while marker exists | `identity:complete-onboarding` fails closed with a safe password-update-required error so a console call or stale UI cannot bypass the mandatory set-password step. |

The recovery marker key is `h2oIdentityProviderPasswordUpdateRequiredV1`. Its schema is intentionally minimal:

```js
{
  version: 1,
  provider: "supabase",
  providerKind: "supabase",
  projectOrigin: "https://<project-ref>.supabase.co",
  reason: "password_recovery",
  createdAt: "<ISO>",
  updatedAt: "<ISO>"
}
```

The marker must never contain raw email, masked email, user ID, password, access token, refresh token, raw session, raw user, provider response data, `owner_user_id`, or `deleted_at`.

Security boundaries remain unchanged: provider bundle owns Supabase auth calls, background owns raw sessions and the persistent refresh-token-only record, UI uses `H2O.Identity` facade and bridge actions only, and password/code values remain transient form state. Reset-link parsing, recovery-token parsing, OAuth, and general account password-change UI remain deferred.

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_8d-email-code-recovery.mjs
```

The release runner includes the 3.8D validator:

```sh
node tools/validation/identity/run-identity-release-gate.mjs
```

## 15.25 Phase 3.8E - Password Integrity Gate

Phase 3.8E adds a durable credential gate so `sync_ready` is reachable only when password setup has been completed. Supabase `user.identities` is not used as the authority because the safe provider metadata identifies the email provider but does not reliably distinguish password-created accounts from OTP/passwordless accounts.

The server-owned status table is `public.identity_password_status`. It is separate from `public.profiles`, has forced RLS, grants no direct table writes to normal users, and may be changed only through the authenticated SECURITY DEFINER RPC `mark_password_setup_completed(p_source text)`.

Approved completion sources are:

```text
password_sign_up
signup_confirmation
password_sign_in
password_recovery_update
```

`load_identity_state()` returns only the safe public field `credential_state`, which the extension exposes as `credentialState: "complete" | "required" | "unknown"`. Missing password status rows are treated as `required`, so legacy OTP-created accounts must set a password before returning to ready. Migration `202605010004_identity_load_identity_state_credential_gate_fix.sql` reasserts this read-only RPC contract for already-migrated dev projects without mutating profile, workspace, membership, or password-status rows.

Runtime policy:

| Flow | Credential behavior |
|---|---|
| Password sign-up/sign-in with real session | Marks credential state complete before ready/cloud restore. |
| Signup confirmation with real session | Marks credential state complete before ready/cloud restore. |
| Normal email-code sign-in | Existing-user only; may reach `sync_ready` only when `credentialState` is complete. |
| Recovery-code verification | Always publishes `password_update_required`, even if the account already had a password. |
| Persistent restore | Does not restore `sync_ready` when credential state is required or unknown. |
| Complete onboarding | Fails closed while password setup is required or credential state is not complete. |

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_8e-password-integrity.mjs
```

The release runner includes the 3.8E validator:

```sh
node tools/validation/identity/run-identity-release-gate.mjs
```

## 15.26 Phase 3.8F - Password Auth Release Gate

Phase 3.8F is the final password-auth release gate before Google OAuth work. It adds docs, a static validator, and release-runner inclusion only. It does not change runtime behavior, provider/background auth semantics, SQL/RLS, UI behavior, manifest/CSP/permissions, packages, Google OAuth, reset-link completion, or account-settings password change.

Password-auth release status:

| Flow | Gate status |
|---|---|
| Password sign-up | Create account requires email, password, and confirm password with local strength checks. |
| Signup confirmation | Signup confirmation can start a real provider session or remain safely pending; no credentials are persisted until a real session exists. |
| Password sign-in | Password sign-in can reach `sync_ready` only after credential state is complete. |
| Existing-user email-code sign-in | Existing-user email-code sign-in uses `shouldCreateUser:false` and may reach ready only when `credentialState` is complete. |
| Wrong-password recovery | Wrong-password recovery sends a recovery code and routes verified recovery sessions to `password_update_required`, not ready. |
| Set new password | `password_update_required` is mandatory before ready and clears only after provider-owned `updateUser({ password })` plus credential RPC completion. |
| Persistent sign-in | Persistent sign-in works after password setup using `h2oIdentityProviderPersistentRefreshV1` with refresh token plus safe metadata only. |
| Sign-out cleanup | Sign-out removes active session, persistent refresh, runtime state, snapshots, and the password-update-required marker. |

Release-blocking password assertions:

| Assertion |
|---|
| No password values in localStorage, sessionStorage, chrome.storage, snapshots, diagnostics, bridge responses, or logs. |
| No access_token, full session, or raw user in `chrome.storage.local`. |
| `h2oIdentityProviderPersistentRefreshV1` contains only `refresh_token` plus safe metadata. |
| Public state exposes no access token, refresh token, raw session, raw user, raw email, `owner_user_id`, or `deleted_at`. |
| Public state may expose only safe `credentialState`. |
| credentialState is the only public password status field. |
| `updateUser({ password })` appears only in the provider bundle/source. |
| Email-code sign-in uses `shouldCreateUser:false`. |
| Recovery-code verification cannot go directly to `sync_ready`. |
| `password_update_required` blocks `complete_onboarding`. |
| Password setup completion can be marked only through `mark_password_setup_completed`. |
| Direct password status table writes are blocked by RLS. |
| Sign-out clears `h2oIdentityProviderSessionV1`, `h2oIdentityProviderPersistentRefreshV1`, and `h2oIdentityProviderPasswordUpdateRequiredV1`. |

Manual password release checklist:

1. New email -> email-code sign-in -> "No account found."
2. Create account weak password -> local block.
3. Create account mismatch -> local block.
4. Create account strong password -> confirmation path.
5. Confirmation code/link path -> session starts or safe pending state.
6. Password sign-in -> `sync_ready`.
7. Wrong password -> safe error plus recovery action.
8. Recovery code -> `password_update_required`.
9. Weak/mismatch new password -> local block.
10. Strong new password -> `credentialState` complete plus `sync_ready`.
11. Chrome restart -> `sync_ready` restored.
12. Sign out -> all credential keys removed.
13. Public leak check -> all sensitive fields false.
14. Live RLS password-status checks pass.

Known limitations and deferred work:

| Item | Status |
|---|---|
| Reset password | Reset password remains request-only; reset-link completion remains deferred. |
| Change-password settings | Change-password account settings UI remains deferred. |
| Microsoft/GitHub/Apple OAuth/social login | Microsoft/GitHub/Apple OAuth/social login remains deferred. |
| MFA | MFA remains deferred. |
| Account deletion/session management | Account deletion/session management remains deferred. |
| Production migration rollout | Production migration rollout still needs an explicit deployment gate. |
| Service-role key | The service-role key is for live RLS env only, never extension runtime. |

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_8f-password-auth-release-gate.mjs
```

Syntax command:

```sh
node --check tools/validation/identity/validate-identity-phase3_8f-password-auth-release-gate.mjs
```

The release runner includes the 3.8F validator:

```sh
node tools/validation/identity/run-identity-release-gate.mjs
```

## 15.27 Phase 3.9B - Google OAuth

Phase 3.9B implements Google OAuth only. Supabase remains the identity authority, Chrome owns the browser redirect through background-only `chrome.identity.launchWebAuthFlow`, and the page/UI still talks only to the `H2O.Identity` facade. Google provider tokens are not stored or exposed. The existing persistent sign-in record remains Supabase `refresh_token` only.

OAuth build policy:

| Area | Policy |
|---|---|
| Build flag | `H2O_IDENTITY_OAUTH_PROVIDER=google` enables Google OAuth. |
| Manifest permission | Only OAuth-enabled builds add the Chrome `"identity"` permission. Default controls, lean, production, and normal armed builds remain without it. |
| Redirect URL | Background calls `chrome.identity.getRedirectURL("identity/oauth/google")`, producing `https://<extension-id>.chromiumapp.org/identity/oauth/google`. |
| Host permissions | Supabase remains exact-host optional permission only. No wildcard Supabase permission, no new CSP, and no wildcard `externally_connectable` are added. |

Dashboard setup:

| System | Required setup |
|---|---|
| Supabase Auth Providers | Enable Google and enter the Google Client ID and Client Secret in Supabase. |
| Supabase Auth Redirect URLs | Add the exact extension redirect URL for every dev/staging/prod extension ID: `https://<extension-id>.chromiumapp.org/identity/oauth/google`. Do not use wildcard redirect URLs for production. |
| Google Cloud OAuth | Configure consent for `openid`, `email`, and `profile`. Authorized redirect URI must be Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`, not the Chrome extension redirect. |

Runtime flow:

| Step | Behavior |
|---|---|
| Start | UI calls `H2O.Identity.signInWithGoogle()`, which sends only `identity:sign-in-with-google` through the bridge. |
| Provider URL | Provider bundle calls `signInWithOAuth` with `skipBrowserRedirect:true`, PKCE flow, `redirectTo` set to the Chrome extension redirect, and scopes `openid email profile`. |
| Browser flow | Background calls `chrome.identity.launchWebAuthFlow` and receives the callback URL. |
| Session exchange | Provider bundle calls `exchangeCodeForSession(code)` and normalizes only the Supabase session. |
| Provider-token stripping | `provider_token`, `provider_refresh_token`, and provider ID-token fields are stripped before any session is stored. |
| Session storage | Background stores the active raw Supabase session only in `chrome.storage.session[h2oIdentityProviderSessionV1]`. |
| Persistent restore | Background stores only the Supabase refresh token plus safe metadata in `chrome.storage.local[h2oIdentityProviderPersistentRefreshV1]`. |
| Credential state | Provider bundle calls the approved `mark_oauth_credential_completed("google")` RPC. `load_identity_state()` returns safe `credentialState` and optional `credentialProvider`. |
| Cloud restore | Background runs the existing safe `load_identity_state` path and reaches profile/onboarding or `sync_ready` according to existing rows. |
| Sign-out | Sign-out clears active session, persistent refresh, transient OAuth flow state, runtime state, and snapshots. |

SQL/RLS policy:

| Object | Policy |
|---|---|
| `identity_oauth_status` | Forced-RLS table keyed by `auth.users(id)` and `provider`, currently allowing only `google`. Normal user roles have no direct table writes. |
| `mark_oauth_credential_completed(p_provider text)` | Authenticated SECURITY DEFINER RPC, derives `auth.uid()`, allows only `google`, and returns only safe credential fields. |
| `load_identity_state()` | Credential state is complete when either password setup is complete or an approved Google OAuth credential exists. Public state may expose only `credentialState: "complete" | "required" | "unknown"` and optional `credentialProvider: "google" | "password" | "multiple" | "unknown"`. |

Forbidden in Phase 3.9B:

| Forbidden item |
|---|
| Page-side Supabase, page-side OAuth parsing, service-role runtime use, admin APIs, `signInWithIdToken`, and `chrome.identity.getAuthToken`. |
| Provider-token persistence: no `provider_token`, no `provider_refresh_token`, no raw OAuth response, and no Google credential storage. |
| Access-token persistence or full-session persistence in `chrome.storage.local`. |
| Microsoft, GitHub, Apple, account linking, reset-link parsing, and OAuth provider-token use. Account linking remains deferred. |

Microsoft/GitHub/Apple remain deferred to later explicit identity tracks.

Validator command:

```sh
node tools/validation/identity/validate-identity-phase3_9b-google-oauth.mjs
```

OAuth-enabled build command:

```sh
env H2O_IDENTITY_PHASE_NETWORK=request_otp H2O_IDENTITY_OAUTH_PROVIDER=google H2O_EXT_OUT_DIR=build/chrome-ext-dev-controls-oauth-google node tools/product/extension/build-chrome-live-extension.mjs
```

Manual Google OAuth checklist:

1. Build the OAuth-enabled armed extension with `H2O_IDENTITY_OAUTH_PROVIDER=google`.
2. Confirm `chrome.identity.getRedirectURL("identity/oauth/google")` matches the Supabase Redirect URL.
3. New Google user signs in, reaches profile/onboarding if no rows exist, then `sync_ready`.
4. Returning Google user signs in and restores `sync_ready`.
5. Chrome restart restores using only the Supabase persistent refresh-token record.
6. Sign out clears active session, persistent refresh, transient OAuth flow state, runtime state, and snapshots.
7. OAuth cancel, redirect mismatch, provider-disabled, and network failures show safe errors.
8. Same-email password account plus Google follows Supabase default behavior; explicit account linking remains deferred.
9. Public leak scan confirms no access token, refresh token, provider token, provider refresh token, raw session, raw user, raw OAuth response, `owner_user_id`, or `deleted_at`.
10. Storage scan confirms `chrome.storage.local` contains only the approved Supabase refresh-token record.

## 15.28 Phase 3.9C - Google OAuth Release Gate

Phase 3.9C is a release-gate checklist for Google OAuth. It adds documentation and static validation only. It does not add Microsoft, GitHub, Apple, account linking, provider-token persistence, page-side Supabase, runtime OAuth behavior changes, SQL/RLS changes, UI behavior changes, manifest logic changes, or package changes.

Exact configured dev release-gate values:

| Area | Required value |
|---|---|
| OAuth build output | `build/chrome-ext-dev-controls-oauth-google` |
| OAuth build flag | `H2O_IDENTITY_OAUTH_PROVIDER=google` |
| Extension redirect URL | `https://amjponmninhldimbkdkfhcmclmjfbibi.chromiumapp.org/identity/oauth/google` |
| Supabase project origin | `https://kjwrrkqqtxyxtuigianr.supabase.co` |
| Supabase optional host permission | `https://kjwrrkqqtxyxtuigianr.supabase.co/*` |
| Supabase callback URL for Google Cloud | `https://kjwrrkqqtxyxtuigianr.supabase.co/auth/v1/callback` |

Dashboard setup requirements:

| System | Required setup |
|---|---|
| Google Cloud OAuth client type | `Web application`. Do not use a Chrome Extension client for this Supabase-mediated OAuth flow. |
| Google Cloud authorized redirect URI | `https://kjwrrkqqtxyxtuigianr.supabase.co/auth/v1/callback`. This is the Supabase callback URL, not the chromiumapp extension URL. |
| Google Cloud scopes | Consent screen covers `openid`, `email`, and `profile`. |
| Supabase Auth Providers | Google provider is enabled and contains the Google Client ID and Client Secret. |
| Supabase Redirect URLs | Add the exact chromiumapp extension URL `https://amjponmninhldimbkdkfhcmclmjfbibi.chromiumapp.org/identity/oauth/google`. Do not use wildcard redirect URLs for production. |
| Extension ID binding | The OAuth-enabled extension ID must be `amjponmninhldimbkdkfhcmclmjfbibi` for this dev release gate, because the Supabase Redirect URL is extension-ID-specific. |

Google OAuth release-gate command:

```sh
node tools/validation/identity/validate-identity-phase3_9c-google-oauth-release-gate.mjs
```

The release runner includes the 3.9C validator:

```sh
node tools/validation/identity/run-identity-release-gate.mjs
```

Manual Google OAuth release checklist:

1. Load only `build/chrome-ext-dev-controls-oauth-google`.
2. Grant Supabase optional host permission for `https://kjwrrkqqtxyxtuigianr.supabase.co/*`.
3. Sign out any existing session.
4. Click `Continue with Google`.
5. Confirm Account tab shows `provider_backed`, `supabase`, and safe credential state/provider such as `Password + Google` or `Google`.
6. Confirm persistent restore after Chrome restart.
7. Confirm public/page leak check has no access token, refresh token, provider token, provider refresh token, raw session, raw user, raw OAuth response, `owner_user_id`, or `deleted_at`.
8. Confirm sign-out clears active session, persistent refresh, password marker, OAuth transient state, runtime, and snapshot.
9. Keep onboarding window open, sign out from Control Hub, and confirm onboarding immediately switches to signed-out Sign in/Create account state.

Known 3.9C limitations:

| Limitation |
|---|
| Microsoft/GitHub/Apple OAuth remains deferred. |
| Same-email account linking remains deferred and follows Supabase default behavior until a separate account-linking phase. |
| OAuth provider tokens are intentionally discarded. H2O persists only the Supabase refresh-token-only record. |
| Google OAuth requires an exact extension ID and matching dashboard redirect configuration. |
| Chrome Web Store production builds require a stable production extension ID and a separate exact Supabase Redirect URL. |
| Production rollout requires a separate deployment gate. |

## 15.29 Phase 4.0B - Account & Security MVP

Phase 4.0B adds the MVP account/security management layer around the working identity stack. It is intentionally narrow: Account/Security settings surface skeleton, safe profile edit, safe workspace rename, credential display, signed-in password change for password-backed accounts, and existing sign-out-this-browser access. It does not add unlinking, account deletion, sign-out everywhere, reset-link completion, new OAuth providers, provider-token storage, page-side Supabase, service-role runtime use, or manifest/CSP/permission/package changes.

Account/security ownership remains unchanged:

| Boundary | Rule |
|---|---|
| UI | Control Hub and identity surfaces use `H2O.Identity` facade methods only. |
| Background | Owns raw session, persistent refresh credential, sign-out race guards, storage keys, and bridge response shaping. |
| Provider bundle | Owns Supabase auth/RPC calls. UI/page/loader never import Supabase, provider bundle, `.rpc(...)`, `.from(...)`, or token/session objects. |
| Persistence | Active session remains `chrome.storage.session[h2oIdentityProviderSessionV1]`; the only persistent secret remains the Supabase refresh-token-only `h2oIdentityProviderPersistentRefreshV1` record. |

Account/security RPCs:

| RPC | Inputs | Validation | Safe return |
|---|---|---|---|
| `update_identity_profile(p_display_name text, p_avatar_color text)` | Display name and avatar color only. No caller-supplied user ID. | Trimmed display name length 1-64; avatar color matches `^[a-z0-9][a-z0-9_-]{0,31}$`; updates only `profiles.id = auth.uid()` with `deleted_at is null`. | `{ "profile": { "id", "display_name", "avatar_color", "onboarding_completed", "created_at", "updated_at" } }` |
| `rename_identity_workspace(p_workspace_name text)` | Workspace name only. No caller-supplied workspace ID. | Trimmed name length 1-64; updates only caller-owned active workspace through `workspace_memberships.user_id = auth.uid()` and `role = 'owner'`. | `{ "workspace": { "id", "name", "created_at", "updated_at" }, "role": "owner" }` |
| `mark_password_setup_completed(p_source text)` | Approved source only. | Adds `password_account_change`; still derives `auth.uid()` and uses `SECURITY DEFINER` with `set search_path = public`. | Safe credential state only. |

All Phase 4.0B RPCs are authenticated `SECURITY DEFINER` functions with `set search_path = public`, derive `auth.uid()`, reject unauthenticated calls, and return safe DTOs only. They never return raw email, `deleted_at`, `owner_user_id`, auth users, provider identities, tokens, raw sessions, raw users, provider responses, membership row IDs, or private DB fields. The password status table remains separate from profiles and still cannot be directly mutated by normal profile update policies.

Signed-in password change:

| Account credential | Behavior |
|---|---|
| `credentialProvider: "password"` | Show current password, new password, and confirm password. |
| `credentialProvider: "multiple"` | Show the same password-change form. |
| `credentialProvider: "google"` | Do not show a password-change form; display `Add password is deferred.` |

The installed local Supabase SDK type uses `current_password?: string`, not `currentPassword`, so the provider helper must call:

```js
client.auth.updateUser({ password: newPassword, current_password: currentPassword })
```

The background action `identity:change-password` passes passwords only through the transient bridge request, calls the provider helper, marks credential status complete through `mark_password_setup_completed("password_account_change")`, reloads/publishes safe identity state, and preserves `credentialState: "complete"`. Wrong current password or rejected new password returns the safe generic error `Current password or new password was not accepted.` Failure must not mutate credential state, public snapshot, active session, or persistent refresh record.

Phase 4.0B facade/bridge actions:

```sh
identity:update-profile
identity:rename-workspace
identity:change-password
```

The static validator for this phase:

```sh
node tools/validation/identity/validate-identity-phase4_0b-account-security-mvp.mjs
node --check tools/validation/identity/validate-identity-phase4_0b-account-security-mvp.mjs
```

Manual Phase 4.0B checklist:

1. Password account changes password with the correct current password.
2. Wrong current password shows `Current password or new password was not accepted.` and leaves `credentialState` unchanged.
3. Password + Google account can change password.
4. Google-only account does not show a password-change form and displays `Add password is deferred.`
5. Profile display name and avatar color edits update Account tab/onboarding state with safe fields only.
6. Workspace rename updates Account tab/onboarding state with safe fields only.
7. Sign out during or after account edits clears active session, persistent refresh, password marker, OAuth transient state, runtime, and snapshots.
8. Public/storage leak checks remain clean: no password, access token, refresh token in page/public state, raw session, raw user, raw email, `owner_user_id`, `deleted_at`, or provider token fields.

Deferred after Phase 4.0B:

| Deferred item |
|---|
| Add password for Google-only accounts. |
| Change-password UI outside signed-in password-backed accounts. |
| Reset-link completion and recovery-token parsing. |
| Credential unlinking/removal and last-credential policy. |
| Sign out everywhere, device/session management, and session revocation UX. |
| Account deletion and data export/privacy workflows. |
| Microsoft/GitHub/Apple OAuth providers. |

## 16. Do-Not-Do Rules

| Rule |
|---|
| Do not add Supabase directly to page scripts. |
| Do not store tokens in `H2O.Identity`. |
| Do not use `chrome-extension://` as the primary email callback strategy. |
| Do not start with magic links. |
| Do not add non-Google OAuth providers before their explicit implementation phases. |
| Do not remove local/dev mode. |
| Do not make Control Hub or Ops Panel auth owners. |
| Do not silently overwrite local data. |
| Do not commit keys, secrets, project URLs, anon keys, service keys, tokens, or real provider config. |
| Do not persist `access_token`, full provider sessions, raw users, raw emails, raw config, provider responses, or provider tokens outside the approved `h2oIdentityProviderPersistentRefreshV1` refresh-token-only record. |
| Do not add real OTP calls before the explicit Phase 3 request-OTP step. |
| Do not add provider SDKs before the approved install/config boundary. |
| Do not change current working identity behavior during documentation-only prep. |

## 17. Open Questions Before Real Supabase Code

| Question |
|---|
| What are the Supabase project names for dev, staging, and prod? |
| What exact env/config injection method will the extension build use? |
| Which SMTP provider will send production OTP emails? |
| What OTP expiry and resend cooldown should be configured? |
| Should 3.7A persistent sign-in later add an explicit opt-out or device management UX? |
| Should profile/workspace rows be created immediately after OTP verification or only after the profile form is submitted? |
| What is the local migration UX for existing local profile and workspace data? |
| Is extension ID stability already guaranteed for future callback and externally-connectable flows? |
| What mobile framework and secure storage choice will be used: native, React Native, Expo, Keychain, SecureStore, or another approved path? |
| What production domain will be used for future magic link, OAuth, and mobile universal-link callback flows? |
