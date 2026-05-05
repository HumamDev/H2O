import React from 'react';
import { PlaceholderScreen } from '@/components/common/PlaceholderScreen';
import { useRouteGuard } from '@/identity/useRouteGuard';

export default function DebugScreen() {
  const guard = useRouteGuard('signed_in');
  if (guard) return guard;
  return (
    <PlaceholderScreen
      title="Debug"
      description="Internal diagnostics, DB inspector, and feature flags."
      // TODO: add DB row viewer, event log, and sync state inspector
    />
  );
}
