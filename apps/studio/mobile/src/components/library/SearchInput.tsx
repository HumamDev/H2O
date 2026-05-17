import React, { useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { spacing, typography } from '@/theme';

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

export function SearchInput({ value, onChangeText }: SearchInputProps) {
  const th = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    container: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    input: {
      backgroundColor: th.backgroundElement,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      ...typography.body,
      color: th.text,
    },
  }), [th.scheme]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search chats and folders…"
        placeholderTextColor={th.textSecondary}
        clearButtonMode="while-editing"
        returnKeyType="search"
        autoCorrect={false}
      />
    </View>
  );
}
