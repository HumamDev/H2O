import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { MiniMapPanel } from '@/components/minimap/MiniMapPanel';
import { TurnBlock } from '@/components/transcript/TurnBlock';
import { readCategoryCatalogRecords } from '@/features/categories';
import { useArchiveChat } from '@/features/chat-reader';
import {
  reclassifyArchiveChatCategory,
  setArchiveChatCategory,
} from '@/features/library/mutations';
import { useMiniMap } from '@/hooks/useMiniMap';
import { useMiniMapTurns } from '@/hooks/useMiniMapTurns';
import { useTheme } from '@/hooks/use-theme';
import { useRouteGuard } from '@/identity/useRouteGuard';
import { getArchiveStoreSnapshot } from '@/state/archive';
import { closeMiniMap } from '@/state/minimap';
import type { ArchiveMessage, CategoryCatalogRecord, CategoryRecord } from '@/types/archive';

export default function ArchiveChatScreen() {
  const guard = useRouteGuard('sync_ready');
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = id ?? '';
  const state = useArchiveChat(chatId);
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();
  const { open: miniMapOpen } = useMiniMap();
  const flatListRef = useRef<FlatList<ArchiveMessage>>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  // Animated scroll progress — updated via setValue so no re-renders during scroll.
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [progressTrackHeight, setProgressTrackHeight] = useState(0);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollable = contentSize.height - layoutMeasurement.height;
    if (scrollable > 0) {
      scrollAnim.setValue(Math.min(1, Math.max(0, contentOffset.y / scrollable)));
    }
  }

  // Derived before early returns so all hooks run unconditionally.
  // Empty array when not ready; early returns below ensure these values are
  // never consumed in that case. Memoized so useMiniMapTurns stays stable.
  const messages = useMemo<ArchiveMessage[]>(() => {
    if (state.status !== 'ready') return [];
    return state.snapshot.messages.slice().sort((a, b) => a.order - b.order);
  }, [state]);

  const miniMapTurns = useMiniMapTurns(messages);
  const categoryCatalog = useMemo<CategoryCatalogRecord[]>(() => (
    readCategoryCatalogRecords(getArchiveStoreSnapshot()).filter(row => row.status === 'active')
  ), [state]);

  // Close MiniMap when navigating away so the toggle button resets on return.
  useFocusEffect(
    useCallback(() => {
      return () => closeMiniMap();
    }, []),
  );

  const scrollToTurn = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.1,
    });
  }, []);

  function handleScrollToIndexFailed(info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) {
    // Scroll to an estimated offset first (no measurement needed), then retry
    // the exact index once that region has been rendered by the virtualizer.
    flatListRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: false,
    });
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({
        index: info.index,
        animated: true,
        viewPosition: 0.1,
      });
    });
  }

  if (guard) return guard;
  if (state.status === 'hydrating') {
    return (
      <View style={[styles.centered, { backgroundColor: th.background }]}>
        <Stack.Screen options={{ title: 'Chat' }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (state.status === 'not-found') {
    return (
      <View style={[styles.centered, { backgroundColor: th.background }]}>
        <Stack.Screen options={{ title: 'Chat' }} />
        <Text style={{ color: th.textSecondary, fontSize: 15 }}>Chat not found.</Text>
      </View>
    );
  }

  if (state.status === 'no-snapshot') {
    const title = state.chatId;
    return (
      <View style={[styles.centered, { backgroundColor: th.background }]}>
        <Stack.Screen options={{ title }} />
        <Text style={{ color: th.textSecondary, fontSize: 15 }}>No messages saved yet.</Text>
      </View>
    );
  }

  const title = (state.snapshot.meta?.title as string | undefined) || state.chatId;
  const category = (state.snapshot.meta?.category ?? null) as CategoryRecord | null;
  const primaryCategoryId = String(category?.primaryCategoryId || '');
  const source = category?.source === 'user' ? 'Manual' : 'System';
  const primaryCategory = categoryCatalog.find(row => row.id === primaryCategoryId);
  const secondaryCategory = categoryCatalog.find(row => row.id === category?.secondaryCategoryId);
  const confidence = Number(category?.confidence);
  const confidenceText = category?.source === 'system' && Number.isFinite(confidence)
    ? `${Math.round(confidence * 100)}%`
    : '';

  const categoryHeader = (
    <View style={[styles.categoryCard, { backgroundColor: th.backgroundElement, borderColor: th.backgroundSelected }]}>
      <View style={styles.categoryTop}>
        <View style={styles.categoryTitleBlock}>
          <Text style={[styles.categoryLabel, { color: th.textSecondary }]}>Category</Text>
          <Text style={[styles.categoryTitle, { color: th.text }]}>{primaryCategory?.name || 'Uncategorized'}</Text>
          {secondaryCategory ? (
            <Text style={[styles.categoryMeta, { color: th.textSecondary }]}>Secondary: {secondaryCategory.name}</Text>
          ) : null}
          {confidenceText ? (
            <Text style={[styles.categoryMeta, { color: th.textSecondary }]}>Confidence: {confidenceText}</Text>
          ) : null}
        </View>
        <View style={[styles.sourcePill, { borderColor: th.backgroundSelected }]}>
          <Text style={[styles.sourceText, { color: th.textSecondary }]}>{source}</Text>
        </View>
      </View>

      <View style={styles.categoryActions}>
        <TouchableOpacity
          style={[styles.smallButton, { borderColor: th.backgroundSelected }]}
          onPress={() => setCategoryPickerOpen(open => !open)}
          activeOpacity={0.7}
        >
          <Text style={[styles.smallButtonText, { color: th.text }]}>Change</Text>
        </TouchableOpacity>
        {category?.source === 'user' ? (
          <TouchableOpacity
            style={[styles.smallButton, { borderColor: th.backgroundSelected }]}
            onPress={() => {
              reclassifyArchiveChatCategory(chatId);
              setCategoryPickerOpen(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.smallButtonText, { color: th.text }]}>Restore system</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.smallButton, { borderColor: th.backgroundSelected }]}
            onPress={() => reclassifyArchiveChatCategory(chatId)}
            activeOpacity={0.7}
          >
            <Text style={[styles.smallButtonText, { color: th.text }]}>Reclassify</Text>
          </TouchableOpacity>
        )}
      </View>

      {categoryPickerOpen ? (
        <View style={styles.categoryPicker}>
          {categoryCatalog.map(row => {
            const selected = row.id === primaryCategoryId;
            return (
              <TouchableOpacity
                key={row.id}
                style={[
                  styles.categoryOption,
                  {
                    borderColor: selected ? '#208AEF' : th.backgroundSelected,
                    backgroundColor: selected ? 'rgba(32,138,239,0.12)' : 'transparent',
                  },
                ]}
                onPress={() => {
                  setArchiveChatCategory(chatId, row.id);
                  setCategoryPickerOpen(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.categoryOptionText, { color: selected ? '#208AEF' : th.text }]}>{row.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: th.background }]}>
      <Stack.Screen options={{ title }} />
      <View style={styles.row}>
        <View style={styles.threadArea}>
          <FlatList<ArchiveMessage>
            ref={flatListRef}
            style={styles.list}
            data={messages}
            keyExtractor={item => String(item.order)}
            renderItem={({ item }) => (
              <TurnBlock
                role={item.role}
                text={item.text}
                chatId={chatId}
                snapshotId={state.snapshot.snapshotId}
                order={item.order}
              />
            )}
            initialNumToRender={20}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            contentContainerStyle={{
              paddingTop: contentTopPadding,
              paddingBottom: contentBottomPadding,
              paddingHorizontal: 16,
            }}
            ListHeaderComponent={categoryHeader}
            // When MiniMap is open the native indicator would sit at the
            // FlatList's right edge, between the thread and rail. Hide it and
            // render a thread-side overlay instead.
            showsVerticalScrollIndicator={!miniMapOpen}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          />
          {miniMapOpen && (() => {
            const thumbTop = scrollAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, Math.max(0, progressTrackHeight - SCROLL_THUMB_HEIGHT)],
              extrapolate: 'clamp',
            });
            return (
              <View
                pointerEvents="none"
                style={styles.progressOverlay}
                onLayout={e => setProgressTrackHeight(e.nativeEvent.layout.height)}
              >
                <Animated.View
                  style={[
                    styles.progressThumb,
                    {
                      top: thumbTop,
                      backgroundColor: th.scheme === 'light'
                        ? 'rgba(0,0,0,0.22)'
                        : 'rgba(255,255,255,0.30)',
                    },
                  ]}
                />
              </View>
            );
          })()}
        </View>
        {miniMapOpen && (() => {
          return <MiniMapPanel turns={miniMapTurns} onTurnPress={scrollToTurn} />;
        })()}
      </View>
    </View>
  );
}

const SCROLL_THUMB_HEIGHT = 32;

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  threadArea: { flex: 1, position: 'relative' },
  list: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progressOverlay: {
    position: 'absolute',
    left: 2,
    top: 14,
    bottom: 14,
    width: 2,
  },
  progressThumb: {
    position: 'absolute',
    width: 2,
    height: SCROLL_THUMB_HEIGHT,
    borderRadius: 1,
  },
  categoryCard: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  categoryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  categoryTitleBlock: { flex: 1, gap: 4 },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  categoryMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  sourcePill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  smallButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
