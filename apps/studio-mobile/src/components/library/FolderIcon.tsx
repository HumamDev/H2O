import { SymbolView } from 'expo-symbols';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface FolderIconProps {
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function FolderIcon({ color, size = 24, style }: FolderIconProps) {
  const th = useTheme();
  const tintColor = color || th.textSecondary;

  return (
    <View style={[styles.wrap, { width: size + 4, height: size + 4 }, style]}>
      <SymbolView
        name={{ ios: 'folder.fill', android: 'folder', web: 'folder' }}
        size={size}
        weight="semibold"
        tintColor={tintColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
