import { router, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserAvatar } from '@/components/common';
import { FolderIcon, openFolderActions } from '@/components/library';
import { deriveCanonicalFolders } from '@/features/folders';
import { deriveArchiveLibraryRows } from '@/features/library/archive-rows';
import { collectCanonicalTagSummaries } from '@/features/tags';
import { useIdentity } from '@/identity/IdentityContext';
import { useTheme } from '@/hooks/use-theme';
import { getArchiveStoreSnapshot, subscribeArchiveStore } from '@/state/archive';
import { getFolderSortMode, subscribeFolderSort } from '@/state/folders';
import { closeSidebar } from '@/state/sidebar';
import { spacing } from '@/theme';

const SIDEBAR_WIDTH = 304;
const SIDEBAR_HIDDEN_OFFSET = SIDEBAR_WIDTH + 48;
const ACCOUNT_PILL_RESERVE = 80;

const NAV_ITEMS = [
  {
    label: 'Library',
    href: '/library',
    icon: { ios: 'books.vertical.fill', android: 'auto_stories', web: 'library_books' },
  },
  {
    label: 'Pinned',
    href: '/pinned',
    icon: { ios: 'pin.fill', android: 'push_pin', web: 'push_pin' },
  },
  {
    label: 'Search',
    href: '/search',
    icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  },
  {
    label: 'Folders',
    href: '/folders',
    icon: { ios: 'folder.fill', android: 'folder', web: 'folder' },
  },
  {
    label: 'Tags',
    href: '/tags',
    icon: { ios: 'tag.fill', android: 'label', web: 'label' },
  },
  {
    label: 'Archived',
    href: '/archived',
    icon: { ios: 'archivebox.fill', android: 'archive', web: 'archive' },
  },
  // Settings has its own floating account pill in the lower-left of the sidebar
  // (rendered only when signed-in). No nav row here to keep the list compact.
] as const;

interface SidebarProps {
  visible: boolean;
}

export function Sidebar({ visible }: SidebarProps) {
  const th = useTheme();
  const identity = useIdentity();
  const { top, bottom } = useSafeAreaInsets();
  const pathname = usePathname();
  const folderSortMode = useSyncExternalStore(subscribeFolderSort, getFolderSortMode);
  const translateX = useRef(new Animated.Value(-SIDEBAR_HIDDEN_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Floating account pill — visible only when signed in. Falls back gracefully
  // if profile hasn't synced yet (uses pendingEmail / "Account").
  const profile = identity.snapshot.profile;
  const accountEmail = profile?.email ?? identity.snapshot.pendingEmail ?? '';
  const accountLocalPart = accountEmail.split('@')[0] ?? '';
  const accountDisplayName =
    profile?.displayName?.trim() || accountLocalPart || 'Account';

  const [foldersExpanded, setFoldersExpanded] = useState(false);
  const folderChevronAnim = useRef(new Animated.Value(0)).current;
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const tagChevronAnim = useRef(new Animated.Value(0)).current;

  function toggleFolders() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !foldersExpanded;
    setFoldersExpanded(next);
    Animated.timing(folderChevronAnim, {
      toValue: next ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  function toggleTags() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !tagsExpanded;
    setTagsExpanded(next);
    Animated.timing(tagChevronAnim, {
      toValue: next ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  const folderChevronRotate = folderChevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  const tagChevronRotate = tagChevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  const archiveStore = useSyncExternalStore(subscribeArchiveStore, getArchiveStoreSnapshot);
  const archiveRows = useMemo(() => deriveArchiveLibraryRows(archiveStore), [archiveStore]);
  const topFolders = useMemo(
    () => deriveCanonicalFolders(archiveRows, archiveStore, folderSortMode).slice(0, 5),
    [archiveRows, archiveStore, folderSortMode],
  );
  const topTags = useMemo(() => {
    return collectCanonicalTagSummaries(archiveStore)
      .slice(0, 5)
      .map(item => item.tag);
  }, [archiveStore]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: visible ? 0 : -SIDEBAR_HIDDEN_OFFSET,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateX, visible]);

  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 100,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.48)',
    },
    drawer: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: th.background,
      borderTopRightRadius: 40,
      borderBottomRightRadius: 40,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: th.hairline,
      overflow: 'hidden',
      paddingTop: top + spacing.lg + 6,
      paddingBottom: bottom + spacing.md,
      paddingHorizontal: spacing.md + 4,
      gap: spacing.md,
    },
    scroll: {
      flex: 1,
      marginHorizontal: -(spacing.md + 4),
    },
    scrollContent: {
      gap: spacing.md,
      paddingHorizontal: spacing.md + 4,
      // Reserve room so the last nav item is never hidden behind the account pill.
      paddingBottom: bottom + spacing.lg + (identity.isSignedIn ? ACCOUNT_PILL_RESERVE : 0),
    },
    brandWrap: {
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.md,
      marginBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: th.hairline,
    },
    drawerTitle: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '700',
      color: th.text,
      letterSpacing: -0.6,
    },
    drawerSubtitle: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 18,
      color: th.textSecondary,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      borderRadius: 20,
    },
    itemActive: {
      backgroundColor: th.accentSoft,
    },
    itemIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: th.backgroundElement,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.hairline,
    },
    itemLabel: { fontSize: 18, lineHeight: 24, color: th.text, fontWeight: '500' },
    itemLabelActive: { color: th.accent, fontWeight: '600' },
    folderChevron: {
      fontSize: 18,
      color: th.textSecondary,
      lineHeight: 24,
    },
    folderPreviewList: {
      marginTop: 2,
    },
    folderPreviewItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: spacing.md + 40 + spacing.sm,
      paddingRight: spacing.md,
      paddingVertical: 9,
      borderRadius: 14,
      gap: spacing.xs,
    },
    folderPreviewIcon: {
      marginRight: 2,
    },
    folderPreviewLabel: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: th.text,
      fontWeight: '400',
    },
    folderShowAll: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: spacing.md + 40 + spacing.sm,
      paddingRight: spacing.md,
      paddingVertical: 9,
      borderRadius: 14,
      marginTop: 2,
    },
    folderShowAllLabel: {
      fontSize: 13,
      color: th.textSecondary,
      fontWeight: '500',
    },
    folderShowAllChevron: {
      fontSize: 15,
      color: th.textSecondary,
      lineHeight: 20,
    },
    accountPill: {
      position: 'absolute',
      left: spacing.md + 4,
      right: spacing.md + 4,
      bottom: bottom + spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingLeft: 8,
      paddingRight: 14,
      paddingVertical: 8,
      backgroundColor: th.backgroundElement,
      borderRadius: 26,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.hairline,
      zIndex: 2,
      // Subtle lift so it reads as floating above the scroll surface.
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    accountTextWrap: { flex: 1, gap: 1 },
    accountName: { fontSize: 15, fontWeight: '600', color: th.text },
    accountEmailLine: { fontSize: 11, color: th.textSecondary },
  }), [bottom, identity.isSignedIn, th.accent, th.accentSoft, th.background, th.backgroundElement, th.hairline, th.text, th.textSecondary, top]);

  return (
    <View style={styles.overlay} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} />
      </Animated.View>
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandWrap}>
            <Text style={styles.drawerTitle}>Cockpit Studio</Text>
            <Text style={styles.drawerSubtitle}>Workspace navigation</Text>
          </View>
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (item.label === 'Folders') {
              return (
                <View key="folders">
                  <TouchableOpacity
                    style={[styles.item, active && styles.itemActive]}
                    activeOpacity={0.6}
                    onPress={toggleFolders}
                  >
                    <View style={styles.itemIconWrap}>
                      <SymbolView name={item.icon} size={20} weight="semibold" tintColor={active ? th.accent : th.text} />
                    </View>
                    <Text style={[styles.itemLabel, active && styles.itemLabelActive, { flex: 1 }]}>
                      {item.label}
                    </Text>
                    <Animated.Text style={[styles.folderChevron, { transform: [{ rotate: folderChevronRotate }] }]}>
                      {'›'}
                    </Animated.Text>
                  </TouchableOpacity>
                  {foldersExpanded && (
                    <View style={styles.folderPreviewList}>
                      {topFolders.map(folder => (
                        <TouchableOpacity
                          key={folder.id}
                          style={styles.folderPreviewItem}
                          activeOpacity={0.6}
                          onLongPress={() => openFolderActions(folder)}
                          delayLongPress={400}
                          onPress={() => {
                            closeSidebar();
                            router.push({ pathname: '/folders/[id]', params: { id: folder.id } } as any);
                          }}
                        >
                          <FolderIcon color={folder.iconColor} size={16} style={styles.folderPreviewIcon} />
                          <Text style={styles.folderPreviewLabel} numberOfLines={1}>{folder.name}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={styles.folderShowAll}
                        activeOpacity={0.6}
                        onPress={() => { closeSidebar(); router.push('/folders'); }}
                      >
                        <Text style={styles.folderShowAllLabel}>Show all folders</Text>
                        <Text style={styles.folderShowAllChevron}>{'›'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }

            if (item.label === 'Tags') {
              return (
                <View key="tags">
                  <TouchableOpacity
                    style={styles.item}
                    activeOpacity={0.6}
                    onPress={toggleTags}
                  >
                    <View style={styles.itemIconWrap}>
                      <SymbolView name="tag.fill" size={20} weight="semibold" tintColor={th.text} />
                    </View>
                    <Text style={[styles.itemLabel, { flex: 1 }]}>Tags</Text>
                    <Animated.Text style={[styles.folderChevron, { transform: [{ rotate: tagChevronRotate }] }]}>
                      {'›'}
                    </Animated.Text>
                  </TouchableOpacity>
                  {tagsExpanded && (
                    <View style={styles.folderPreviewList}>
                      {topTags.map(tag => (
                        <TouchableOpacity
                          key={tag}
                          style={styles.folderPreviewItem}
                          activeOpacity={0.6}
                          onPress={() => {
                            closeSidebar();
                            router.push({ pathname: '/library', params: { tag } } as any);
                          }}
                        >
                          <Text style={styles.folderPreviewLabel} numberOfLines={1}>#{tag}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={styles.folderShowAll}
                        activeOpacity={0.6}
                        onPress={() => { closeSidebar(); router.push('/tags' as any); }}
                      >
                        <Text style={styles.folderShowAllLabel}>Show all tags</Text>
                        <Text style={styles.folderShowAllChevron}>{'›'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }

            return (
              <TouchableOpacity
                key={item.href}
                style={[styles.item, active && styles.itemActive]}
                activeOpacity={0.6}
                onPress={() => { closeSidebar(); router.push(item.href as any); }}
              >
                <View style={styles.itemIconWrap}>
                  <SymbolView name={item.icon} size={20} weight="semibold" tintColor={active ? th.accent : th.text} />
                </View>
                <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {identity.isSignedIn ? (
          <TouchableOpacity
            style={styles.accountPill}
            activeOpacity={0.7}
            onPress={() => { closeSidebar(); router.push('/settings'); }}
            accessibilityLabel={`Open settings for ${accountDisplayName}`}
          >
            <UserAvatar
              size={40}
              displayName={profile?.displayName ?? null}
              email={accountEmail}
            />
            <View style={styles.accountTextWrap}>
              <Text style={styles.accountName} numberOfLines={1}>
                {accountDisplayName}
              </Text>
              {accountEmail ? (
                <Text style={styles.accountEmailLine} numberOfLines={1}>
                  {accountEmail}
                </Text>
              ) : null}
            </View>
            <SymbolView
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              size={16}
              weight="semibold"
              tintColor={th.textSecondary}
            />
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    </View>
  );
}
