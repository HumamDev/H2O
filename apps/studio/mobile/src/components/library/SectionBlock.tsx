import React, { useMemo, useRef, useState } from 'react';
import { Animated, LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { spacing, typography } from '@/theme';

interface SectionBlockProps {
  title: string;
  emptyLabel?: string;
  children?: React.ReactNode;
  isEmpty: boolean;
}

export function SectionBlock({ title, emptyLabel, children, isEmpty }: SectionBlockProps) {
  const th = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => StyleSheet.create({
    section: {
      marginBottom: spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: spacing.md,
      marginBottom: spacing.xs,
      paddingVertical: 2,
    },
    header: {
      ...typography.caption,
      fontWeight: '700',
      color: th.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    chevron: {
      fontSize: 13,
      color: th.textSecondary,
      lineHeight: 18,
    },
    empty: {
      ...typography.caption,
      color: th.textSecondary,
      fontStyle: 'italic',
      marginHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
  }), [th.scheme]);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !collapsed;
    setCollapsed(next);
    Animated.timing(chevronAnim, {
      toValue: next ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['90deg', '0deg'],
  });

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.headerRow} onPress={toggle} activeOpacity={0.6}>
        <Text style={styles.header}>{title}</Text>
        <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronRotate }] }]}>
          {'›'}
        </Animated.Text>
      </TouchableOpacity>
      {!collapsed && (
        isEmpty ? (
          <Text style={styles.empty}>{emptyLabel ?? 'Nothing here yet.'}</Text>
        ) : (
          children
        )
      )}
    </View>
  );
}
