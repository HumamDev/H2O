import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import React, { useEffect, useSyncExternalStore } from 'react';
import { useColorScheme, View } from 'react-native';

import { AppTopBar, type TopBarLeftAction, type TopBarRightAction } from '../components/navigation/AppTopBar';
import { Sidebar } from '../components/navigation/Sidebar';
import { IdentityProvider } from '@/identity/IdentityContext';
import { initArchiveStore } from '@/state/archive';
import { initImportedChatsStore } from '@/state/imported-chats';
import {
  getAppearanceMode,
  initAppearanceStore,
  subscribeAppearance,
} from '@/state/appearance';
import { getSidebarOpen, subscribeSidebar } from '@/state/sidebar';

function getTopBarConfig(pathname: string): { title: string; leftAction: TopBarLeftAction; rightAction?: TopBarRightAction } | null {
  if (pathname === '/') return null;
  if (pathname === '/library') return { title: 'Library', leftAction: 'menu' };
  if (pathname === '/pinned') return { title: 'Pinned', leftAction: 'back' };
  if (pathname === '/search') return { title: 'Search', leftAction: 'back' };
  if (pathname === '/tags') return { title: 'Tags', leftAction: 'back' };
  if (pathname === '/archived') return { title: 'Archived', leftAction: 'back' };
  if (pathname === '/settings') return { title: 'Settings', leftAction: 'back' };
  if (pathname === '/identity-debug') return { title: 'Identity Debug', leftAction: 'back' };
  if (pathname === '/account-identity') return { title: 'Identity & Sign-in', leftAction: 'back' };
  if (pathname === '/import-export') return { title: 'Import / Export', leftAction: 'back' };
  if (pathname === '/import-chatgpt-link') return { title: 'Import ChatGPT Link', leftAction: 'back' };
  if (pathname === '/menu') return { title: 'H2O Studio', leftAction: 'back' };
  if (pathname === '/debug') return { title: 'Debug', leftAction: 'back' };
  if (pathname === '/folders') return { title: 'Folders', leftAction: 'back' };
  if (pathname.startsWith('/folders/')) return { title: 'Folder', leftAction: 'back' };
  if (pathname.startsWith('/chat/')) return { title: 'Chat', leftAction: 'back', rightAction: 'minimap' };
  if (pathname.startsWith('/imported-chat/')) return { title: 'Imported Chat', leftAction: 'back' };
  return null;
}

export default function RootLayout() {
  const pathname = usePathname();
  const systemScheme = useColorScheme();
  const appearanceMode = useSyncExternalStore(subscribeAppearance, getAppearanceMode);
  const sidebarOpen = useSyncExternalStore(subscribeSidebar, getSidebarOpen);
  const topBarConfig = getTopBarConfig(pathname);

  // Mirror useTheme's resolution: cockpit → dark nav, system → cockpit-on-dark
  // / light-on-light, explicit light/dark stay as-is. Any non-light scheme
  // uses React Navigation's DarkTheme so headers/borders look right.
  const effectiveScheme =
    appearanceMode === 'cockpit'
      ? 'cockpit'
      : appearanceMode === 'system'
        ? systemScheme === 'dark'
          ? 'cockpit'
          : 'light'
        : appearanceMode;
  const navScheme: 'light' | 'dark' = effectiveScheme === 'light' ? 'light' : 'dark';

  useEffect(() => {
    initArchiveStore();
    initImportedChatsStore();
    initAppearanceStore();
  }, []);

  return (
    <ThemeProvider value={navScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <IdentityProvider>
        <View style={{ flex: 1 }}>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="library" options={{ headerShown: false }} />
            <Stack.Screen name="pinned" options={{ headerShown: false }} />
            <Stack.Screen name="search" options={{ headerShown: false }} />
            <Stack.Screen name="tags" options={{ headerShown: false }} />
            <Stack.Screen name="archived" options={{ headerShown: false }} />
            <Stack.Screen name="folders" options={{ title: 'Folders', headerShown: false }} />
            <Stack.Screen name="chat" options={{ title: 'Chat', headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="identity-debug" options={{ headerShown: false }} />
            <Stack.Screen name="account-identity" options={{ headerShown: false }} />
            <Stack.Screen name="import-export" options={{ headerShown: false }} />
            <Stack.Screen name="import-chatgpt-link" options={{ headerShown: false }} />
            <Stack.Screen name="imported-chat" options={{ title: 'Imported Chat', headerShown: false }} />
            <Stack.Screen name="menu" options={{ headerShown: false }} />
            <Stack.Screen name="debug" options={{ headerShown: false }} />
          </Stack>
          {topBarConfig ? <AppTopBar title={topBarConfig.title} leftAction={topBarConfig.leftAction} rightAction={topBarConfig.rightAction} /> : null}
          <Sidebar visible={sidebarOpen} />
        </View>
      </IdentityProvider>
    </ThemeProvider>
  );
}
