import React from 'react';
import { PlaceholderScreen } from '@/components/common/PlaceholderScreen';

export default function DebugScreen() {
  return (
    <PlaceholderScreen
      title="Debug"
      description="Internal diagnostics, DB inspector, and feature flags."
      // TODO: add DB row viewer, event log, and sync state inspector
    />
  );
}
