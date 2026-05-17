import { Redirect } from 'expo-router';
import React from 'react';

import { CockpitSplash } from '@/components/cockpit/CockpitSplash';
import { useIdentity } from '@/identity/IdentityContext';

// Phase 5.0K — mobile route guard hook.
//
// Returns a guard element to render in place of the screen content when the
// caller does not satisfy the requested level. Returns null when the caller
// can proceed.
//
// Usage at the top of any protected screen:
//
//     const guard = useRouteGuard('sync_ready');
//     // ... existing hooks (unchanged) ...
//     if (guard) return guard;
//     return ( ...existing JSX... );
//
// The early return is placed after ALL existing hooks (Rules of Hooks: every
// hook in the component must be called in the same order on every render —
// the guard's `useIdentity` call inside this hook is consistent across all
// render paths because it always runs first).
//
// Levels:
//   - 'public'     — no guard; returns null. Most public routes don't need
//                    this hook at all (e.g., /account-identity).
//   - 'signed_in'  — must be signed in; snapshot.status not checked. Used
//                    for /menu, /settings, /debug, /identity-debug.
//   - 'sync_ready' — must be signed in AND snapshot.status === 'sync_ready'.
//                    Used for the entire app interior (/library, /chat/[id],
//                    /folders/*, etc.).
//
// Redirect targets:
//   - signed-out → /account-identity
//   - signed-in but not sync_ready (when sync_ready required) → /onboarding
//
// Trusts onboarding.tsx to handle transient identity states
// (password_update_required, recovery_code_pending, etc.) correctly. The
// guard sends anything not sync_ready to /onboarding and lets onboarding
// decide where to route from there.

export type RouteGuardLevel = 'public' | 'signed_in' | 'sync_ready';

export function useRouteGuard(level: RouteGuardLevel): React.ReactElement | null {
  const identity = useIdentity();

  if (!identity.isReady) return <CockpitSplash />;
  if (level === 'public') return null;

  if (!identity.isSignedIn) return <Redirect href="/account-identity" />;
  if (level === 'signed_in') return null;

  // sync_ready
  if (identity.snapshot.status !== 'sync_ready') return <Redirect href="/onboarding" />;
  return null;
}
