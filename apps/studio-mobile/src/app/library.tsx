import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActionSheetIOS, Alert, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ChatRow, FolderRow, SearchInput, SectionBlock } from '@/components/library';
import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { deriveCanonicalFolders, findFolderAssignmentByName } from '@/features/folders';
import { readLabelCatalogRecords } from '@/features/labels';
import { deriveArchiveLibraryRows } from '@/features/library/archive-rows';
import { filterChats, filterChatsByTag, filterFolders } from '@/features/library';
import {
  assignArchiveChatToFolder,
  deleteArchiveChat,
  pinArchiveChat,
  renameArchiveChat,
  removeArchiveChatFromFolder,
  setArchiveChatTags,
  unpinArchiveChat,
} from '@/features/library/mutations';
import { formatTagsForInput, parseTagInput } from '@/features/tags';
import { useTheme } from '@/hooks/use-theme';
import { useRouteGuard } from '@/identity/useRouteGuard';
import { getArchiveStoreSnapshot, subscribeArchiveStore } from '@/state/archive';
import { getFolderSortMode, subscribeFolderSort } from '@/state/folders';
import { spacing } from '@/theme';
import type { Chat, Folder } from '@/types/library';

function promptMoveToFolder(chat: Chat, folders: Folder[]): void {
  Alert.prompt(
    'Move to Folder',
    'Enter an existing or new folder name.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move',
        onPress: (value: string | undefined) => {
          const assignment = findFolderAssignmentByName(folders, value ?? '');
          if (!assignment) return;
          assignArchiveChatToFolder(chat.id, assignment.id, assignment.name);
        },
      },
    ],
    'plain-text',
  );
}

function openChatActions(chat: Chat, folders: Folder[]): void {
  if (Platform.OS !== 'ios') return;
  const options = [
    chat.pinned ? 'Unpin' : 'Pin',
    'Rename',
    'Edit Tags',
    'Move to Folder',
    ...(chat.folderId ? ['Remove from Folder'] : []),
    'Share',
    'Delete',
    'Cancel',
  ];

  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: chat.title,
      options,
      cancelButtonIndex: options.indexOf('Cancel'),
      destructiveButtonIndex: options.indexOf('Delete'),
    },
    (buttonIndex) => {
      const action = options[buttonIndex];
      if (action === 'Pin' || action === 'Unpin') {
        chat.pinned ? unpinArchiveChat(chat.id) : pinArchiveChat(chat.id);
      } else if (action === 'Rename') {
        Alert.prompt(
          'Rename Chat',
          undefined,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Save', onPress: (value: string | undefined) => { if (value?.trim()) renameArchiveChat(chat.id, value.trim()); } },
          ],
          'plain-text',
          chat.title,
        );
      } else if (action === 'Edit Tags') {
        Alert.prompt(
          'Edit Tags',
          'Separate multiple tags with commas',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Save', onPress: (value: string | undefined) => { setArchiveChatTags(chat.id, parseTagInput(value ?? '')); } },
          ],
          'plain-text',
          formatTagsForInput(chat.tags ?? []),
        );
      } else if (action === 'Move to Folder') {
        promptMoveToFolder(chat, folders);
      } else if (action === 'Remove from Folder') {
        removeArchiveChatFromFolder(chat.id);
      } else if (action === 'Share') {
        Share.share({
          title: chat.title,
          message: [chat.title, chat.snippet].filter(Boolean).join('\n\n'),
        });
      } else if (action === 'Delete') {
        Alert.alert(
          'Delete Chat',
          `Delete "${chat.title}"? This cannot be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteArchiveChat(chat.id) },
          ],
        );
      }
    },
  );
}

export default function LibraryScreen() {
  const guard = useRouteGuard('sync_ready');
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const { tag: tagParam } = useLocalSearchParams<{ tag?: string }>();

  useEffect(() => {
    setActiveTag(tagParam ? String(tagParam) : null);
  }, [tagParam]);

  const archiveStore = useSyncExternalStore(subscribeArchiveStore, getArchiveStoreSnapshot);
  const folderSortMode = useSyncExternalStore(subscribeFolderSort, getFolderSortMode);
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const archiveRows = useMemo(() => deriveArchiveLibraryRows(archiveStore), [archiveStore]);
  const labelCatalog = useMemo(() => readLabelCatalogRecords(archiveStore), [archiveStore]);
  const canonicalFolders = useMemo(
    () => deriveCanonicalFolders(archiveRows, archiveStore, folderSortMode),
    [archiveRows, archiveStore, folderSortMode],
  );
  const filteredArchiveRows = useMemo(() => {
    const byQuery = filterChats(archiveRows, query, labelCatalog);
    return activeTag ? filterChatsByTag(byQuery, activeTag) : byQuery;
  }, [archiveRows, query, activeTag, labelCatalog]);
  const filteredFolders = useMemo(() => filterFolders(canonicalFolders, query), [canonicalFolders, query]);

  const savedChats = useMemo(() => filteredArchiveRows.filter(c => !c.archived), [filteredArchiveRows]);
  const pinnedChats = useMemo(() => savedChats.filter(c => c.pinned), [savedChats]);
  const recentChats = useMemo(() => savedChats.filter(c => !c.pinned), [savedChats]);

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    scroll: { flex: 1, backgroundColor: th.background },
    content: {},
    tagFilterWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    tagFilterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: th.backgroundElement,
      borderRadius: 8,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      gap: spacing.xs,
    },
    tagFilterLabel: { fontSize: 13, fontWeight: '600', color: th.text },
    tagFilterClear: { fontSize: 13, color: th.textSecondary },
  }), [th.background, th.backgroundElement, th.text, th.textSecondary]);

  if (guard) return guard;
  return (
    <View style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: contentTopPadding,
            paddingBottom: contentBottomPadding,
          },
        ]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
      >
        <SearchInput value={query} onChangeText={setQuery} />

        {activeTag && (
          <View style={styles.tagFilterWrap}>
            <TouchableOpacity
              style={styles.tagFilterChip}
              onPress={() => setActiveTag(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.tagFilterLabel}>#{activeTag}</Text>
              <Text style={styles.tagFilterClear}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {archiveRows.length > 0 ? (
          <SectionBlock
            title="Saved Chats"
            isEmpty={savedChats.length === 0}
            emptyLabel={activeTag ? `No saved chats tagged "${activeTag}".` : 'No saved chats match your search.'}
          >
            {savedChats.map(chat => (
              <ChatRow
                key={chat.id}
                chat={chat}
                onPress={id => router.push(`/chat/${id}`)}
                onLongPress={() => openChatActions(chat, canonicalFolders)}
                onTagPress={(tag) => setActiveTag(tag)}
              />
            ))}
          </SectionBlock>
        ) : null}

        <SectionBlock
          title="Pinned"
          isEmpty={pinnedChats.length === 0}
          emptyLabel={query ? 'No pinned chats match your search.' : 'No pinned chats yet.'}
        >
          {pinnedChats.map(chat => (
            <ChatRow
              key={chat.id}
              chat={chat}
              onPress={id => router.push(`/chat/${id}`)}
              onLongPress={() => openChatActions(chat, canonicalFolders)}
              onTagPress={(tag) => setActiveTag(tag)}
            />
          ))}
        </SectionBlock>

        <SectionBlock
          title="Recent"
          isEmpty={recentChats.length === 0}
          emptyLabel={query ? 'No recent chats match your search.' : 'No chats yet.'}
        >
          {recentChats.map(chat => (
            <ChatRow
              key={chat.id}
              chat={chat}
              onPress={id => router.push(`/chat/${id}`)}
              onLongPress={() => openChatActions(chat, canonicalFolders)}
              onTagPress={(tag) => setActiveTag(tag)}
            />
          ))}
        </SectionBlock>

        <SectionBlock
          title="Folders"
          isEmpty={filteredFolders.length === 0}
          emptyLabel={query ? 'No folders match your search.' : 'No folders yet.'}
        >
          {filteredFolders.map(folder => (
            <FolderRow key={folder.id} folder={folder} onPress={id => router.push({ pathname: '/folders/[id]', params: { id } } as any)} />
          ))}
        </SectionBlock>
      </ScrollView>
    </View>
  );
}
