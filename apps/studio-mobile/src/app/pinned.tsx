import { router } from 'expo-router';
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChatRow, SearchInput } from '@/components/library';
import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { readLabelCatalogRecords } from '@/features/labels';
import { filterChats } from '@/features/library';
import { deriveArchiveLibraryRows } from '@/features/library/archive-rows';
import { useTheme } from '@/hooks/use-theme';
import { getArchiveStoreSnapshot, subscribeArchiveStore } from '@/state/archive';
import { spacing } from '@/theme';

export default function PinnedScreen() {
  const [query, setQuery] = useState('');
  const archiveStore = useSyncExternalStore(subscribeArchiveStore, getArchiveStoreSnapshot);
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const archiveRows = useMemo(() => deriveArchiveLibraryRows(archiveStore), [archiveStore]);
  const labelCatalog = useMemo(() => readLabelCatalogRecords(archiveStore), [archiveStore]);
  const pinnedRows = useMemo(
    () => filterChats(archiveRows, query, labelCatalog).filter(row => row.pinned === true),
    [archiveRows, query, labelCatalog],
  );

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    scroll: { flex: 1, backgroundColor: th.background },
    content: {},
    empty: {
      marginHorizontal: spacing.md,
      color: th.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      paddingVertical: spacing.lg,
    },
  }), [th.background, th.textSecondary]);

  return (
    <View style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SearchInput value={query} onChangeText={setQuery} />
        {pinnedRows.length === 0 ? (
          <Text style={styles.empty}>{query ? 'No pinned chats match your search.' : 'No pinned chats yet.'}</Text>
        ) : (
          <View>
            {pinnedRows.map(chat => (
              <ChatRow
                key={chat.id}
                chat={chat}
                onPress={id => router.push(`/chat/${id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
