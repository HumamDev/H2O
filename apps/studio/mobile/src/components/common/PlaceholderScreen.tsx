import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useTheme } from '@/hooks/use-theme';

interface PlaceholderScreenProps {
  title: string;
  description?: string;
}

/**
 * Lightweight wrapper used by every placeholder route screen.
 * Replace or augment per-screen once real content is ready.
 */
export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.background }]} edges={[]}>
      <View style={[styles.content, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }]}>
        <Text style={[styles.title, { color: th.text }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: th.textSecondary }]}>{description}</Text> : null}
        <Text style={[styles.badge, { color: th.textSecondary }]}>— placeholder —</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 300,
  },
  badge: {
    marginTop: 16,
    fontSize: 12,
    fontStyle: 'italic',
  },
});
