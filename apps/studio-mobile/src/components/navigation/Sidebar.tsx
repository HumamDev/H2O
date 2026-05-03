import { router, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FolderIcon, openFolderActions } from '@/components/library';
import { deriveCanonicalFolders } from '@/features/folders';
import { deriveArchiveLibraryRows } from '@/features/library/archive-rows';
import { collectCanonicalTagSummaries } from '@/features/tags';
import { useTheme } from '@/hooks/use-theme';
import { getArchiveStoreSnapshot, subscribeArchiveStore } from '@/state/archive';
import { getFolderSortMode, subscribeFolderSort } from '@/state/folders';
import { closeSidebar } from '@/state/sidebar';
import { spacing } from '@/theme';

const SIDEBAR_WIDTH = 304;
const SIDEBAR_HIDDEN_OFFSET = SIDEBAR_WIDTH + 48;

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
  {
    label: 'Settings',
    href: '/settings',
    icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  },
] as const;

interface SidebarProps {
  visible: boolean;
}

export function Sidebar({ visible }: SidebarProps) {
  const th = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const pathname = usePathname();
  const folderSortMode = useSyncExternalStore(subscribeFolderSort, getFolderSortMode);
  const translateX = useRef(new Animated.Value(-SIDEBAR_HIDDEN_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const isDarkSurface = th.scheme !== 'light';

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
      backgroundColor: isDarkSurface ? '#1f1f21' : '#f6f7fa',
      borderTopRightRadius: 40,
      borderBottomRightRadius: 40,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: isDarkSurface ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
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
      paddingBottom: bottom + spacing.lg,
    },
    brandWrap: {
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.md,
      marginBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDarkSurface ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.08)',
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
      backgroundColor: isDarkSurface ? '#090909' : '#e8ebf3',
    },
    itemIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDarkSurface ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDarkSurface ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)',
    },
    itemLabel: { fontSize: 18, lineHeight: 24, color: th.text, fontWeight: '500' },
    itemLabelActive: { color: th.text, fontWeight: '600' },
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
  }), [bottom, isDarkSurface, th.text, th.textSecondary, top]);

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
                      <SymbolView name={item.icon} size={20} weight="semibold" tintColor={th.text} />
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
                  <SymbolView name={item.icon} size={20} weight="semibold" tintColor={th.text} />
                </View>
                <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
