import React from 'react';
import { PlaceholderScreen } from '@/components/common/PlaceholderScreen';
import { useRouteGuard } from '@/identity/useRouteGuard';

export default function SearchScreen() {
  const guard = useRouteGuard('sync_ready');
  if (guard) return guard;
  return (
    <PlaceholderScreen
      title="Search"
      description="Full-text search across your saved conversations."
      // TODO: wire up search index (SQLite FTS5 or in-memory index)
    />
  );
}
