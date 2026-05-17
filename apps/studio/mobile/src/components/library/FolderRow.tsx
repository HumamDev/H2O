import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FolderIcon } from '@/components/library/FolderIcon';
import { useTheme } from '@/hooks/use-theme';
import { spacing, typography } from '@/theme';
import type { Folder } from '@/types/library';

interface FolderRowProps {
  folder: Folder;
  onPress: (id: string) => void;
  onLongPress?: (folder: Folder) => void;
}

export function FolderRow({ folder, onPress, onLongPress }: FolderRowProps) {
  const th = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: th.backgroundSelected,
      gap: spacing.sm,
    },
    body: { flex: 1 },
    name: { ...typography.body, fontWeight: '600', color: th.text },
    count: { ...typography.caption, color: th.textSecondary },
    chevron: { fontSize: 20, color: th.textSecondary, fontWeight: '300' },
  }), [th.backgroundSelected, th.text, th.textSecondary]);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(folder.id)}
      onLongPress={onLongPress ? () => onLongPress(folder) : undefined}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <FolderIcon color={folder.iconColor} size={24} />
      <View style={styles.body}>
        <Text style={styles.name}>{folder.name}</Text>
        <Text style={styles.count}>
          {folder.chatCount === 0 ? 'Empty' : `${folder.chatCount} chat${folder.chatCount !== 1 ? 's' : ''}`}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}
