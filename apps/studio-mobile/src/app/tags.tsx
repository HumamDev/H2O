import { router } from 'expo-router';
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import {
  deleteArchiveTagGlobally,
  mergeArchiveTagGlobally,
  renameArchiveTagGlobally,
} from '@/features/library/mutations';
import {
  collectCanonicalTagSummaries,
  normalizeTagInput,
  type CanonicalTagSummary,
} from '@/features/tags';
import { useTheme } from '@/hooks/use-theme';
import { getArchiveStoreSnapshot, subscribeArchiveStore } from '@/state/archive';
import { spacing, typography } from '@/theme';

const DANGER = '#FF3B30';

interface TagRowStyles {
  row: ViewStyle;
  rowBody: ViewStyle;
  tagName: TextStyle;
  count: TextStyle;
  action: ViewStyle;
  actionText: TextStyle;
}

function openLibraryTag(tag: string): void {
  router.push({ pathname: '/library', params: { tag } } as any);
}

function openTagActions(tag: string, existingTags: string[]): void {
  if (Platform.OS !== 'ios') return;

  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: `#${tag}`,
      options: ['Rename', 'Merge Into...', 'Delete', 'Cancel'],
      cancelButtonIndex: 3,
      destructiveButtonIndex: 2,
    },
    (buttonIndex) => {
      if (buttonIndex === 0) {
        Alert.prompt(
          'Rename Tag',
          undefined,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Save',
              onPress: (value: string | undefined) => {
                const next = normalizeTagInput(value);
                if (!next || next === tag) return;
                if (existingTags.includes(next)) {
                  Alert.alert('Tag Already Exists', 'Use Merge Into to combine existing tags.');
                  return;
                }
                renameArchiveTagGlobally(tag, next);
              },
            },
          ],
          'plain-text',
          tag,
        );
      } else if (buttonIndex === 1) {
        Alert.prompt(
          'Merge Tag',
          `Merge "${tag}" into another tag.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Merge',
              onPress: (value: string | undefined) => {
                const destination = normalizeTagInput(value);
                if (!destination || destination === tag) return;
                mergeArchiveTagGlobally(tag, destination);
              },
            },
          ],
          'plain-text',
        );
      } else if (buttonIndex === 2) {
        Alert.alert(
          'Delete Tag',
          `Remove "${tag}" from all saved chats?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => deleteArchiveTagGlobally(tag),
            },
          ],
        );
      }
    },
  );
}

export default function TagsScreen() {
  const archiveStore = useSyncExternalStore(subscribeArchiveStore, getArchiveStoreSnapshot);
  const [query, setQuery] = useState('');
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const tagSummaries = useMemo(
    () => collectCanonicalTagSummaries(archiveStore),
    [archiveStore],
  );
  const existingTags = useMemo(() => tagSummaries.map(item => item.tag), [tagSummaries]);
  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tagSummaries;
    return tagSummaries.filter(item => item.tag.toLowerCase().includes(q));
  }, [query, tagSummaries]);

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    scroll: { flex: 1, backgroundColor: th.background },
    content: {
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    intro: {
      color: th.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    search: {
      backgroundColor: th.backgroundElement,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      ...typography.body,
      color: th.text,
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: th.backgroundSelected,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: th.backgroundSelected,
    },
    rowBody: { flex: 1, gap: 2 },
    tagName: {
      ...typography.body,
      color: th.text,
      fontWeight: '600',
    },
    count: {
      fontSize: 12,
      color: th.textSecondary,
    },
    action: {
      minWidth: 44,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      backgroundColor: th.backgroundElement,
    },
    actionText: {
      color: th.accent,
      fontSize: 18,
      lineHeight: 20,
      fontWeight: '700',
    },
    empty: {
      color: th.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      paddingVertical: spacing.lg,
    },
    dangerHint: {
      color: DANGER,
      fontSize: 12,
      lineHeight: 17,
    },
  }), [th.accent, th.background, th.backgroundElement, th.backgroundSelected, th.text, th.textSecondary]);

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
        <Text style={styles.intro}>
          Manage canonical tags stored on saved chat archive metadata.
        </Text>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search tags..."
          placeholderTextColor={th.textSecondary}
          clearButtonMode="while-editing"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />

        {tagSummaries.length === 0 ? (
          <Text style={styles.empty}>No saved chat tags yet.</Text>
        ) : filteredTags.length === 0 ? (
          <Text style={styles.empty}>No tags match your search.</Text>
        ) : (
          <View style={styles.list}>
            {filteredTags.map(item => (
              <TagRow
                key={item.tag}
                item={item}
                existingTags={existingTags}
                styles={styles}
              />
            ))}
          </View>
        )}

        {tagSummaries.length > 0 ? (
          <Text style={styles.dangerHint}>
            Rename, merge, and delete apply across saved chat archive snapshots.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function TagRow({
  item,
  existingTags,
  styles,
}: {
  item: CanonicalTagSummary;
  existingTags: string[];
  styles: TagRowStyles;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => openLibraryTag(item.tag)}
      onLongPress={() => openTagActions(item.tag, existingTags)}
      delayLongPress={400}
    >
      <View style={styles.rowBody}>
        <Text style={styles.tagName} numberOfLines={1}>#{item.tag}</Text>
        <Text style={styles.count}>
          {item.count} saved chat{item.count === 1 ? '' : 's'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.action}
        activeOpacity={0.6}
        onPress={() => openTagActions(item.tag, existingTags)}
      >
        <Text style={styles.actionText}>...</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
