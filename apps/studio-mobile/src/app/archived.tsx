import { router } from 'expo-router';
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { ActionSheetIOS, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChatRow, SearchInput } from '@/components/library';
import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { readLabelCatalogRecords } from '@/features/labels';
import { filterChats } from '@/features/library';
import { deriveArchiveLibraryRows } from '@/features/library/archive-rows';
import { unarchiveArchiveChat } from '@/features/library/mutations';
import { useTheme } from '@/hooks/use-theme';
import { getArchiveStoreSnapshot, subscribeArchiveStore } from '@/state/archive';
import { spacing } from '@/theme';
import type { Chat } from '@/types/library';

function openArchivedChatActions(chat: Chat): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: chat.title,
        options: ['Unarchive', 'Cancel'],
        cancelButtonIndex: 1,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) unarchiveArchiveChat(chat.id);
      },
    );
    return;
  }

  Alert.alert(
    chat.title,
    undefined,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unarchive', onPress: () => unarchiveArchiveChat(chat.id) },
    ],
  );
}

export default function ArchivedScreen() {
  const [query, setQuery] = useState('');
  const archiveStore = useSyncExternalStore(subscribeArchiveStore, getArchiveStoreSnapshot);
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const archiveRows = useMemo(() => deriveArchiveLibraryRows(archiveStore), [archiveStore]);
  const labelCatalog = useMemo(() => readLabelCatalogRecords(archiveStore), [archiveStore]);
  const archivedRows = useMemo(
    () => filterChats(archiveRows, query, labelCatalog).filter(row => row.archived === true),
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
        {archivedRows.length === 0 ? (
          <Text style={styles.empty}>{query ? 'No archived chats match your search.' : 'No archived chats yet.'}</Text>
        ) : (
          <View>
            {archivedRows.map(chat => (
              <ChatRow
                key={chat.id}
                chat={chat}
                onPress={id => router.push(`/chat/${id}`)}
                onLongPress={() => openArchivedChatActions(chat)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
