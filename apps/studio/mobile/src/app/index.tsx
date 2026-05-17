import { Redirect } from 'expo-router';
import React from 'react';

import { CockpitSplash } from '@/components/cockpit/CockpitSplash';
import { useIdentity } from '@/identity/IdentityContext';

// Identity-aware root gate.
//
//   identity not ready                       → CockpitSplash (loading)
//   signed out                               → /account-identity
//   signed in but status !== 'sync_ready'    → /onboarding
//   signed in and status === 'sync_ready'    → /library
//
// Onboarding completion is server-side: profiles.onboarding_completed via the
// existing complete_onboarding RPC. Snapshot status of 'sync_ready' means
// profile + workspace exist and onboarding is complete.
export default function Index() {
  const identity = useIdentity();

  if (!identity.isReady) {
    return <CockpitSplash />;
  }

  if (!identity.isSignedIn) {
    return <Redirect href="/account-identity" />;
  }

  if (identity.snapshot.status !== 'sync_ready') {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/library" />;
}
