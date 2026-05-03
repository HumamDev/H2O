import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatRow, FolderIcon, openFolderActions } from '@/components/library';
import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { deriveCanonicalFolders, getChatsForFolder, getUnfiledChats, isUnfiledFolderId, UNFILED_FOLDER_ID } from '@/features/folders';
import { deriveArchiveLibraryRows } from '@/features/library/archive-rows';
import { useTheme } from '@/hooks/use-theme';
import { getArchiveStoreSnapshot, subscribeArchiveStore } from '@/state/archive';
import { spacing, typography } from '@/theme';

export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const folderId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const archiveStore = useSyncExternalStore(subscribeArchiveStore, getArchiveStoreSnapshot);
  const th = useTheme();
  const { anchorStyle, contentTopPadding, contentBottomPadding } = useTopBarMetrics();
  const isUnfiled = isUnfiledFolderId(folderId);

  const archiveRows = useMemo(() => deriveArchiveLibraryRows(archiveStore), [archiveStore]);
  const folders = useMemo(() => deriveCanonicalFolders(archiveRows, archiveStore), [archiveRows, archiveStore]);
  const chats = useMemo(
    () => (isUnfiled ? getUnfiledChats(archiveRows) : getChatsForFolder(archiveRows, folderId)),
    [archiveRows, folderId, isUnfiled],
  );
  const folder = useMemo(
    () => (isUnfiled
      ? { id: UNFILED_FOLDER_ID, name: 'Unfiled', chatCount: chats.length, kind: 'local' as const }
      : folders.find(item => item.id === folderId) ?? null),
    [chats.length, folderId, folders, isUnfiled],
  );

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    scroll: { flex: 1, backgroundColor: th.background },
    content: {
      gap: spacing.md,
    },
    headingWrap: {
      marginHorizontal: spacing.md,
      gap: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    titleTextWrap: {
      flex: 1,
      gap: 4,
    },
    title: {
      ...typography.title,
      color: th.text,
    },
    subtitle: {
      color: th.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    empty: {
      marginHorizontal: spacing.md,
      color: th.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      paddingVertical: spacing.lg,
    },
    actionButton: {
      position: 'absolute',
      right: spacing.md,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
      backgroundColor: th.backgroundElement,
      zIndex: 90,
    },
    actionText: {
      color: '#208AEF',
      fontSize: 18,
      lineHeight: 20,
      fontWeight: '700',
    },
  }), [th.background, th.backgroundElement, th.text, th.textSecondary]);

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
        ]}
      >
        <View style={styles.headingWrap}>
          <View style={styles.titleRow}>
            <FolderIcon color={folder?.iconColor} size={28} />
            <View style={styles.titleTextWrap}>
              <Text style={styles.title}>{folder?.name ?? 'Folder'}</Text>
              <Text style={styles.subtitle}>
                {isUnfiled ? 'No folder assigned' : `${chats.length} saved chat${chats.length === 1 ? '' : 's'}`}
              </Text>
            </View>
          </View>
        </View>

        {chats.length === 0 ? (
          <Text style={styles.empty}>{isUnfiled ? 'No unfiled chats.' : 'This folder is empty or no longer exists.'}</Text>
        ) : (
          <View>
            {chats.map(chat => (
              <ChatRow
                key={chat.id}
                chat={chat}
                onPress={chatId => router.push(`/chat/${chatId}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
      {folder && !isUnfiled ? (
        <TouchableOpacity
          style={[styles.actionButton, anchorStyle]}
          activeOpacity={0.7}
          onPress={() => openFolderActions(folder)}
          accessibilityLabel="Folder actions"
        >
          <Text style={styles.actionText}>...</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}
