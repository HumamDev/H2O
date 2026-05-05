# Phase 5.0K Mobile Route-Guard Hardening Closeout

> **Status: DRAFT — pending real-device deep-link QA.**
> The Phase 5.0K-A implementation is complete in the working tree.
> `tsc --noEmit` is clean and the new route-guards validator passes
> independently. Real-iPhone deep-link verification (every row in the QA
> matrix below) is blocked by missing Apple Developer access — the same
> carryover blocker that gates 5.0G live testing and 5.0I-C live billing
> QA. This closeout is the gate input for stamping QA results once
> real-device testing can run.

## Summary

Before 5.0K, only the root index route (`/`) had identity-aware redirects.
Direct deep links to interior routes (e.g., `studiomobile://chat/abc-123`,
`studiomobile://library`, `studiomobile://settings`) bypassed the gate
entirely — a signed-out user with the right URL could land on a screen that
expected sync data.

5.0K closed this gap with:

1. A small `useRouteGuard` hook in `apps/studio-mobile/src/identity/`.
2. Per-screen guard calls on every protected route (15 screens).
3. A static validator that asserts the protection table is complete and
   exempt routes don't accidentally over-protect.

The implementation is per-screen (not a layout-group refactor) to minimise
blast radius and keep each screen's guard contract visible inside its own
file. Each protected screen gets a 3-line edit.

## Route access matrix

### `sync_ready` — must be signed in AND `snapshot.status === 'sync_ready'`

The full app interior. These screens read sync data (folders, archived
chats, transcripts) that requires a complete profile + workspace.

- `apps/studio-mobile/src/app/library.tsx`
- `apps/studio-mobile/src/app/pinned.tsx`
- `apps/studio-mobile/src/app/archived.tsx`
- `apps/studio-mobile/src/app/search.tsx`
- `apps/studio-mobile/src/app/tags.tsx`
- `apps/studio-mobile/src/app/folders/index.tsx`
- `apps/studio-mobile/src/app/folders/[id].tsx`
- `apps/studio-mobile/src/app/chat/[id].tsx`
- `apps/studio-mobile/src/app/imported-chat/[id].tsx`
- `apps/studio-mobile/src/app/import-chatgpt-link.tsx`
- `apps/studio-mobile/src/app/import-export.tsx`

### `signed_in` — must be signed in (snapshot status not checked)

Account / utility surfaces that work mid-onboarding (e.g., a partially-
onboarded user can sign out from the menu) and don't require sync data.

- `apps/studio-mobile/src/app/menu.tsx`
- `apps/studio-mobile/src/app/settings.tsx`
- `apps/studio-mobile/src/app/debug.tsx`
- `apps/studio-mobile/src/app/identity-debug.tsx`

### `public` — accessible regardless of auth state

Routes with their own guard logic or that must serve signed-out users.

- `apps/studio-mobile/src/app/index.tsx` — root index; existing
  three-way redirect logic (signed-out → `/account-identity`, signed-in
  not sync_ready → `/onboarding`, sync_ready → `/library`).
- `apps/studio-mobile/src/app/account-identity.tsx` — public; signed-out
  entry point. Signed-in users access account management here too.
- `apps/studio-mobile/src/app/onboarding.tsx` — owns its own
  status-aware redirects. The guard would loop here, so it's intentionally
  exempt.
- `apps/studio-mobile/src/app/account-billing.tsx` — has a built-in
  signed-out empty state with a "Go to sign-in" link (kinder UX than a
  hard redirect for users who deep-linked here). Decision 1 from the 5.0K
  design lock.
- `apps/studio-mobile/src/app/_layout.tsx` — root layout, never a
  screen.

## Hook architecture

`apps/studio-mobile/src/identity/useRouteGuard.tsx` exports:

```ts
export type RouteGuardLevel = 'public' | 'signed_in' | 'sync_ready';

export function useRouteGuard(level: RouteGuardLevel): React.ReactElement | null;
```

Behavior:

| Identity state | Requested level | Returns |
|---|---|---|
| `!isReady` | any | `<CockpitSplash />` |
| ready, any | `'public'` | `null` |
| ready, signed-out | `'signed_in'` | `<Redirect href="/account-identity" />` |
| ready, signed-out | `'sync_ready'` | `<Redirect href="/account-identity" />` |
| ready, signed-in | `'signed_in'` | `null` |
| ready, signed-in, `status !== 'sync_ready'` | `'sync_ready'` | `<Redirect href="/onboarding" />` |
| ready, signed-in, `status === 'sync_ready'` | `'sync_ready'` | `null` |

Usage at the top of any protected screen:

```tsx
export default function FooScreen() {
  const guard = useRouteGuard('sync_ready');  // first hook
  // ... existing hooks (unchanged) ...
  if (guard) return guard;                     // after all hooks
  return ( ...existing JSX... );
}
```

Rules-of-Hooks compliance: `useRouteGuard` is the first hook called, but
the `if (guard) return guard;` early-return is placed AFTER all other hooks
have been called. This ensures the same number of hooks runs on every
render, regardless of guard outcome. The cost is one extra render of the
hook tree during a redirect — negligible because:
- Hooks in protected screens read pure local state (theme, archive store,
  metrics) that doesn't crash without auth.
- Redirect renders are transient (one frame before navigation).

Trusts `onboarding.tsx` to handle transient identity states
(`password_update_required`, `recovery_code_pending`, etc.) correctly. The
guard sends anything not `sync_ready` to `/onboarding` and lets onboarding
decide where to route from there. **Verify during QA** (matrix row 15
below) — if onboarding can't handle a transient state cleanly, the hook
may need a special-case branch.

## Validator summary

`tools/validation/identity/validate-mobile-route-guards.mjs` (~145 lines)
asserts three categories:

### 1. Hook shape (5 checks)
- `apps/studio-mobile/src/identity/useRouteGuard.tsx` exists.
- Exports `RouteGuardLevel` union type with the three string literals.
- Exports `useRouteGuard(level: RouteGuardLevel)` function.
- Returns `<CockpitSplash />` when not ready.
- Has both `<Redirect>` calls (`/account-identity`, `/onboarding`).
- Reads identity state via `useIdentity()`.

### 2. Protected routes (15 routes × 4 checks each)
For each entry in the `PROTECTED_ROUTES` table:
- File imports `useRouteGuard` from `@/identity/useRouteGuard`.
- Calls `useRouteGuard('<expected-level>')` exactly.
- Has `if (guard) return guard;` early-return idiom.
- Does NOT call any other level (regression guard against accidental
  level drift — e.g., a `sync_ready` route accidentally calling
  `useRouteGuard('public')`).

### 3. Exempt routes (5 routes × 1 check each)
For each route in the `EXEMPT_ROUTES` list:
- File does NOT import `useRouteGuard` (catches accidental
  over-protection of public/special routes).

The validator is wired into `tools/validation/identity/run-identity-release-gate.mjs`
both as a runtime validator and as a syntax-check entry, alongside the
other mobile validators.

## Validation status

| Command | Result |
|---|---|
| `cd apps/studio-mobile && npx tsc --noEmit` | ✅ exit 0 |
| `node tools/validation/identity/validate-mobile-route-guards.mjs` | ✅ PASS |
| All other mobile validators (5.0F, 5.0G, 5.0B, 5.0E, 5.0D, 5.0I) | ✅ PASS independently |
| `node tools/validation/identity/run-identity-release-gate.mjs` | Release gate blocked by off-limits parallel work. |

## Runtime QA matrix

> All rows below are **PENDING** until real-iPhone deep-link testing is
> performed. The matrix will be stamped with `PASS` (or `FAIL` with
> diagnostic notes) after QA. QA requires Apple Developer access and a
> signed iOS dev build.

### Cold-launch regression (existing index logic must continue to work)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Cold launch signed-out, no deep link | `/` → `/account-identity` | **PENDING** |
| 2 | Cold launch signed-in sync_ready, no deep link | `/` → `/library` | **PENDING** |
| 3 | Cold launch signed-in not sync_ready, no deep link | `/` → `/onboarding` | **PENDING** |

### Signed-out deep links (NEW protection)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 4 | Deep link `studiomobile://library` while signed-out | Redirects to `/account-identity` | **PENDING** |
| 5 | Deep link `studiomobile://chat/abc-123` while signed-out | Redirects to `/account-identity` | **PENDING** |
| 6 | Deep link `studiomobile://folders/xyz` while signed-out | Redirects to `/account-identity` | **PENDING** |
| 7 | Deep link `studiomobile://settings` while signed-out | Redirects to `/account-identity` | **PENDING** |
| 8 | Deep link `studiomobile://identity-debug` while signed-out | Redirects to `/account-identity` | **PENDING** |
| 9 | Deep link `studiomobile://import-chatgpt-link?url=...` while signed-out | Redirects to `/account-identity`; URL param lost (acceptable v1) | **PENDING** |

### Signed-in incomplete deep links (NEW protection)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 10 | Deep link `studiomobile://chat/abc-123` while signed-in but `status !== 'sync_ready'` | Redirects to `/onboarding` | **PENDING** |
| 11 | Deep link `studiomobile://library` while signed-in but not sync_ready | Redirects to `/onboarding` | **PENDING** |
| 12 | Deep link `studiomobile://folders` while signed-in but not sync_ready | Redirects to `/onboarding` | **PENDING** |
| 13 | Deep link `studiomobile://settings` while signed-in but not sync_ready | Renders settings (signed_in level satisfied) | **PENDING** |
| 14 | Deep link `studiomobile://menu` while signed-in but not sync_ready | Renders menu (signed_in level satisfied) | **PENDING** |

### Sync-ready deep links (no regression expected)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 15 | Deep link `studiomobile://chat/abc-123` while sync_ready | Opens the chat | **PENDING** |
| 16 | Deep link `studiomobile://folders/xyz` while sync_ready | Opens the folder | **PENDING** |
| 17 | Deep link `studiomobile://imported-chat/abc-123` while sync_ready | Opens the imported chat | **PENDING** |
| 18 | All other sync_ready routes via deep link | Open normally | **PENDING** |

### `/account-billing` exception (built-in empty state preserved)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 19 | Deep link `studiomobile://account-billing` while signed-out | Renders the built-in empty state with "Go to sign-in" link (no redirect) | **PENDING** |
| 20 | Deep link `studiomobile://account-billing` while signed-in | Renders the billing screen normally | **PENDING** |

### Sign-out while on a protected route

| # | Scenario | Expected | Result |
|---|---|---|---|
| 21 | While on `/library`, sign out from menu | Guard fires on next render, redirects to `/account-identity` | **PENDING** |
| 22 | While on `/chat/abc-123`, sign out from elsewhere | Guard fires, redirects to `/account-identity` | **PENDING** |
| 23 | While on `/account-billing`, sign out | Built-in empty state engages (guard exemption) | **PENDING** |
| 24 | While on `/onboarding`, sign out | Onboarding's own logic handles; should redirect to `/account-identity` | **PENDING** |

### Onboarding completion flow

| # | Scenario | Expected | Result |
|---|---|---|---|
| 25 | While on `/onboarding`, complete onboarding (status → sync_ready) | Onboarding's existing redirect to `/library` fires; library guard passes | **PENDING** |
| 26 | While on `/onboarding`, navigate to `/library` directly | Sync_ready guard redirects back to `/onboarding` until status flips | **PENDING** |

### Edge cases

| # | Scenario | Expected | Result |
|---|---|---|---|
| 27 | Force-quit on a deep-linked URL, relaunch | Identity restores via refresh-token path → guard evaluates → user lands correctly per their tier | **PENDING** |
| 28 | Brief network blip during boot | `<CockpitSplash />` shows for `!isReady`, then guard evaluates correctly when ready | **PENDING** |
| 29 | Mid-onboarding transient state (`password_update_required` or `recovery_code_pending`) deep-link to `/library` | Guard sends to `/onboarding`; onboarding handles the transient state per its own logic. **If onboarding can't handle these gracefully, the hook needs a special-case branch.** | **PENDING** |
| 30 | Rapid sign-in → sign-out → deep link race | Guard re-evaluates on every render; final state is consistent | **PENDING** |

## Blockers

1. **Apple Developer access required.** Real-iPhone signed dev builds are
   needed for deep-link testing — the same blocker that's been carrying
   over since the original 5.0G plan. iOS Simulator can run the app and
   exercise deep links via `xcrun simctl openurl`, but full QA confidence
   requires real-hardware behavior (cold launches, force-quit recovery,
   AppState transitions, real network blips).
2. **Release gate blocked by off-limits parallel work.** Unrelated to
   mobile; ignored per boundary rules. Mobile-side validators all pass
   independently, including the new route-guards validator.
3. **Trust-but-verify on transient identity states.** Decision 4 from
   approval was to trust `onboarding.tsx` for `password_update_required` /
   `recovery_code_pending` flow. Row 29 of the QA matrix is the explicit
   verification. If it fails, the hook gets a special-case branch in
   5.0K-D polish.

## Deferred (out of scope for v1)

- **Remember-intended-destination after login.** Currently a deep link to
  `/chat/abc-123` while signed-out redirects to `/account-identity`; after
  sign-in, the user lands on `/library` (per `account-identity.tsx`'s
  post-auth redirect logic), not back on the original `/chat/abc-123`.
  Capturing the intended destination across the auth flow is v2 polish.
- **Special handling for transient identity states** (e.g.,
  `password_update_required` users sent to a dedicated screen instead of
  `/onboarding`). Wait on QA row 29 — only add complexity if real-device
  testing reveals an issue.
- **Layout-group refactor** (e.g., `(authed)/_layout.tsx` wrapping all
  protected screens). Cleaner long-term but more invasive than the
  per-screen hook. Not needed for v1; revisit if the route count grows or
  if guard logic becomes more complex than the 3-level matrix.
- **Backend session enforcement.** RLS already gates per-user data access;
  the guards are pure UX. Real authorization happens in Supabase. No
  backend work needed for 5.0K.
- **Telemetry on guard fires.** Could log "guard fired on `/chat/abc-123`
  for signed-out user" to understand deep-link patterns. Out of scope; add
  later if needed for debugging.
- **Animated transitions during redirect.** Currently `<Redirect>` swaps
  routes immediately. Could add a brief crossfade or splash. Cosmetic;
  defer.

## Status of dependencies

| Dependency | State |
|---|---|
| `IdentityContext` (`useIdentity`, `isReady`, `isSignedIn`, `snapshot.status`) | done; stable since 5.0B core |
| `CockpitSplash` component | done; reused from `/` index |
| `<Redirect>` from `expo-router` | available |
| `useRouteGuard` hook | done in 5.0K-A |
| 15 protected screens | done in 5.0K-A |
| `validate-mobile-route-guards.mjs` validator | done in 5.0K-A; wired |
| Real-iPhone deep-link QA (5.0K-C) | **blocked** — Apple Developer access |
| Closeout finalization (5.0K-D) | depends on 5.0K-C |

This document will be revisited and stamped with QA results when
real-device testing can run. The locked-in design above is the contract;
QA may surface copy / behavior tweaks to land in 5.0K-D before the
milestone closes.
