import React from 'react';
import { PlaceholderScreen } from '@/components/common/PlaceholderScreen';

export default function SearchScreen() {
  return (
    <PlaceholderScreen
      title="Search"
      description="Full-text search across your saved conversations."
      // TODO: wire up search index (SQLite FTS5 or in-memory index)
    />
  );
}
