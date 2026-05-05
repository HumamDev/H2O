import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useTheme } from '@/hooks/use-theme';
import { useRouteGuard } from '@/identity/useRouteGuard';

export default function MenuScreen() {
  const guard = useRouteGuard('signed_in');
  const router = useRouter();
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  if (guard) return guard;
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.background }]} edges={[]}>
      <View style={[styles.inner, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }]}>
        <Text style={[styles.title, { color: th.text }]}>H2O Studio</Text>
        <Text style={[styles.subtitle, { color: th.textSecondary }]}>Your ChatGPT conversation library.</Text>

        <View style={styles.nav}>
          <TouchableOpacity style={styles.navButton} onPress={() => router.push('/library')}>
            <Text style={styles.navButtonText}>Library</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navButton} onPress={() => router.push('/search')}>
            <Text style={styles.navButtonText}>Search</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navButton} onPress={() => router.push('/folders')}>
            <Text style={styles.navButtonText}>Folders</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navButton, styles.navButtonImport]} onPress={() => router.push('/import-chatgpt-link')}>
            <Text style={styles.navButtonText}>Import ChatGPT Link</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navButton, styles.navButtonImportExport]} onPress={() => router.push('/import-export')}>
            <Text style={styles.navButtonText}>Import / Export</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navButton, styles.navButtonSecondary]} onPress={() => router.push('/settings')}>
            <Text style={styles.navButtonText}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  nav: {
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
  navButton: {
    backgroundColor: '#208AEF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  navButtonImport: {
    backgroundColor: '#1a9e6e',
  },
  navButtonImportExport: {
    backgroundColor: '#7B5EA7',
  },
  navButtonSecondary: {
    backgroundColor: '#888',
  },
  navButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
