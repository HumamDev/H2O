import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { spacing, typography } from '@/theme';
import { relativeTime } from '@/utils/date';
import type { Chat } from '@/types/library';

const PRIMARY = '#208AEF';
const MOBILE = '#1a9e6e';
const PINNED_RED = '#FF3B30';
const MAX_TAGS = 2;

interface ChatRowProps {
  chat: Chat;
  onPress: (id: string) => void;
  onLongPress?: () => void;
  onTagPress?: (tag: string) => void;
}

export function ChatRow({ chat, onPress, onLongPress, onTagPress }: ChatRowProps) {
  const th = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: th.backgroundSelected,
      gap: spacing.sm,
    },
    body: { flex: 1, gap: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    title: { ...typography.body, fontWeight: '600', color: th.text, flexShrink: 1 },
    snippet: { ...typography.caption, color: th.textSecondary, lineHeight: 17 },
    time: { ...typography.caption, color: th.textSecondary, marginTop: 2, flexShrink: 0 },
    pin: { backgroundColor: PINNED_RED + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    pinText: { fontSize: 10, fontWeight: '600', color: PINNED_RED },
    source: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    sourceText: { fontSize: 10, fontWeight: '600' },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    archived: { backgroundColor: th.backgroundSelected, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    archivedText: { fontSize: 10, fontWeight: '600', color: th.textSecondary },
    folder: { backgroundColor: th.backgroundElement, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    folderText: { fontSize: 10, fontWeight: '500', color: th.textSecondary },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    tagPill: {
      backgroundColor: th.backgroundElement,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    tagText: { fontSize: 10, fontWeight: '500', color: th.textSecondary },
  }), [th.backgroundSelected, th.backgroundElement, th.text, th.textSecondary]);

  const originSource = chat.originSource || chat.source || 'unknown';
  const sourceColor = originSource === 'mobile' ? MOBILE : PRIMARY;
  const sourceLabel = originSource === 'mobile' ? 'Mobile' : originSource === 'browser' ? 'Browser' : '';
  const folderLabel = chat.folderName || chat.folderId || '';

  const visibleTags = chat.tags?.slice(0, MAX_TAGS) ?? [];
  const overflowCount = Math.max(0, (chat.tags?.length ?? 0) - MAX_TAGS);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(chat.id)}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{chat.title}</Text>
        </View>
        <View style={styles.badgeRow}>
          {chat.pinned && <View style={styles.pin}><Text style={styles.pinText}>Pinned</Text></View>}
          {chat.archived && <View style={styles.archived}><Text style={styles.archivedText}>Archived</Text></View>}
          {sourceLabel ? (
            <View style={[styles.source, { backgroundColor: sourceColor + '22' }]}>
              <Text style={[styles.sourceText, { color: sourceColor }]}>{sourceLabel}</Text>
            </View>
          ) : null}
          {folderLabel ? (
            <View style={styles.folder}><Text style={styles.folderText} numberOfLines={1}>{folderLabel}</Text></View>
          ) : null}
        </View>
        <Text style={styles.snippet} numberOfLines={2}>{chat.snippet}</Text>
        {visibleTags.length > 0 && (
          <View style={styles.tagRow}>
            {visibleTags.map(tag => (
              <Pressable
                key={tag}
                style={styles.tagPill}
                onPress={onTagPress ? () => onTagPress(tag) : undefined}
                hitSlop={4}
              >
                <Text style={styles.tagText}>{tag}</Text>
              </Pressable>
            ))}
            {overflowCount > 0 && (
              <View style={styles.tagPill}>
                <Text style={styles.tagText}>+{overflowCount}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      <Text style={styles.time}>{relativeTime(chat.updatedAt)}</Text>
    </TouchableOpacity>
  );
}
