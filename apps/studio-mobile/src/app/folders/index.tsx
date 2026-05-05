import { router } from 'expo-router';
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { ActionSheetIOS, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FolderRow } from '@/components/library';
import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { deriveCanonicalFolders, getUnfiledChats, UNFILED_FOLDER_ID, type FolderSortMode } from '@/features/folders';
import { filterFolders } from '@/features/library';
import { deriveArchiveLibraryRows } from '@/features/library/archive-rows';
import { createArchiveFolder } from '@/features/library/mutations';
import { useTheme } from '@/hooks/use-theme';
import { useRouteGuard } from '@/identity/useRouteGuard';
import { getArchiveStoreSnapshot, subscribeArchiveStore } from '@/state/archive';
import { getFolderSortMode, setFolderSortMode, subscribeFolderSort } from '@/state/folders';
import { spacing, typography } from '@/theme';
import type { Folder } from '@/types/library';

const FOLDER_SORT_LABELS: Record<FolderSortMode, string> = {
  alphabetical: 'Alphabetical',
  'newest-created': 'Newest created',
  'most-recent-use': 'Most recent use',
};

function promptCreateFolder() {
  Alert.prompt(
    'Create Folder',
    'Enter a folder name.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create',
        onPress: (value: string | undefined) => createArchiveFolder(value ?? ''),
      },
    ],
    'plain-text',
  );
}

function openFolderActions(folderSortMode: FolderSortMode) {
  if (Platform.OS !== 'ios') return;
  const options = [
    'Create folder',
    `Sort: ${FOLDER_SORT_LABELS.alphabetical}`,
    `Sort: ${FOLDER_SORT_LABELS['newest-created']}`,
    `Sort: ${FOLDER_SORT_LABELS['most-recent-use']}`,
    'Cancel',
  ];

  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: 'Folders',
      message: `Current sort: ${FOLDER_SORT_LABELS[folderSortMode]}`,
      options,
      cancelButtonIndex: 4,
    },
    (buttonIndex) => {
      if (buttonIndex === 0) {
        promptCreateFolder();
      } else if (buttonIndex === 1) {
        setFolderSortMode('alphabetical');
      } else if (buttonIndex === 2) {
        setFolderSortMode('newest-created');
      } else if (buttonIndex === 3) {
        setFolderSortMode('most-recent-use');
      }
    },
  );
}

export default function FoldersListScreen() {
  const guard = useRouteGuard('sync_ready');
  const archiveStore = useSyncExternalStore(subscribeArchiveStore, getArchiveStoreSnapshot);
  const folderSortMode = useSyncExternalStore(subscribeFolderSort, getFolderSortMode);
  const [query, setQuery] = useState('');
  const th = useTheme();
  const { anchorStyle, contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const archiveRows = useMemo(() => deriveArchiveLibraryRows(archiveStore), [archiveStore]);
  const unfiledChats = useMemo(() => getUnfiledChats(archiveRows), [archiveRows]);
  const utilityFolders = useMemo<Folder[]>(
    () => (unfiledChats.length > 0
      ? [{ id: UNFILED_FOLDER_ID, name: 'Unfiled', chatCount: unfiledChats.length, kind: 'local' }]
      : []),
    [unfiledChats.length],
  );
  const folders = useMemo(
    () => deriveCanonicalFolders(archiveRows, archiveStore, folderSortMode),
    [archiveRows, archiveStore, folderSortMode],
  );
  const filteredUtilityFolders = useMemo(() => filterFolders(utilityFolders, query), [utilityFolders, query]);
  const filteredFolders = useMemo(() => filterFolders(folders, query), [folders, query]);
  const visibleFolders = useMemo(
    () => [...filteredUtilityFolders, ...filteredFolders],
    [filteredUtilityFolders, filteredFolders],
  );
  const hasAnyFolderRows = folders.length > 0 || utilityFolders.length > 0;

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    scroll: { flex: 1, backgroundColor: th.background },
    content: {
      gap: spacing.md,
    },
    intro: {
      marginHorizontal: spacing.md,
      color: th.textSecondary,
      fontSize: 13,
      lineHeight: 18,
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
    search: {
      marginHorizontal: spacing.md,
      backgroundColor: th.backgroundElement,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      ...typography.body,
      color: th.text,
    },
    empty: {
      marginHorizontal: spacing.md,
      color: th.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      paddingVertical: spacing.lg,
    },
  }), [th.background, th.backgroundElement, th.text, th.textSecondary]);

  if (guard) return guard;
  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>Folders from saved chat archive metadata.</Text>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search folders..."
          placeholderTextColor={th.textSecondary}
          clearButtonMode="while-editing"
          returnKeyType="search"
          autoCorrect={false}
        />

        {!hasAnyFolderRows ? (
          <Text style={styles.empty}>No saved chat folders yet.</Text>
        ) : visibleFolders.length === 0 ? (
          <Text style={styles.empty}>No folders match your search.</Text>
        ) : (
          <View>
            {visibleFolders.map(folder => (
              <FolderRow
                key={folder.id}
                folder={folder}
                onPress={id => router.push({ pathname: '/folders/[id]', params: { id } } as any)}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <TouchableOpacity
        style={[styles.actionButton, anchorStyle]}
        activeOpacity={0.7}
        onPress={() => openFolderActions(folderSortMode)}
        accessibilityLabel="Folder actions"
      >
        <Text style={styles.actionText}>...</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
