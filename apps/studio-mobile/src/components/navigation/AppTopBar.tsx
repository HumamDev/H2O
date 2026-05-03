import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useMemo, useSyncExternalStore } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { getTopBarPosition, subscribeTopBarPosition } from '@/state/appearance';
import { getMiniMapOpen, subscribeMiniMap, toggleMiniMap } from '@/state/minimap';
import { toggleSidebar } from '@/state/sidebar';
import { spacing, typography } from '@/theme';

export type TopBarLeftAction = 'menu' | 'back' | 'none';
export type TopBarRightAction = 'minimap';

export const TOP_BAR_HEIGHT = 44;
export const TOP_BAR_TOP_OFFSET = 4;
export const TOP_BAR_BOTTOM_OFFSET = 12;
export const TOP_BAR_FADE_HEIGHT = 76;
const SIDE_MENU_WIDTH = 44;
const SIDE_BACK_WIDTH = 44;

export function useTopBarMetrics() {
  const { top, bottom } = useSafeAreaInsets();
  const topBarPosition = useSyncExternalStore(subscribeTopBarPosition, getTopBarPosition);

  const isReachable = topBarPosition === 'reachable';
  const anchorTop = top + TOP_BAR_TOP_OFFSET;
  const anchorBottom = bottom + TOP_BAR_BOTTOM_OFFSET;
  const contentTopPadding = anchorTop + TOP_BAR_HEIGHT + spacing.md;
  const contentBottomPadding = isReachable
    ? anchorBottom + TOP_BAR_HEIGHT + TOP_BAR_FADE_HEIGHT + spacing.md
    : bottom + spacing.xl;

  return {
    isReachable,
    anchorStyle: isReachable ? { bottom: anchorBottom } : { top: anchorTop },
    contentTopPadding,
    contentBottomPadding,
  } as const;
}

type AppTopBarProps = {
  title: string;
  leftAction?: TopBarLeftAction;
  rightAction?: TopBarRightAction;
};

export function AppTopBar({ title, leftAction = 'none', rightAction }: AppTopBarProps) {
  const router = useRouter();
  const th = useTheme();
  const { isReachable, anchorStyle } = useTopBarMetrics();
  const miniMapOpen = useSyncExternalStore(subscribeMiniMap, getMiniMapOpen);

  const glassColorScheme = th.scheme === 'light' ? 'light' : 'dark';
  const glassTint = th.scheme === 'light' ? 'rgba(255,255,255,0.18)' : 'rgba(18,20,24,0.24)';
  const sideWidth = leftAction === 'back' ? SIDE_BACK_WIDTH : leftAction === 'menu' ? SIDE_MENU_WIDTH : 0;

  const styles = useMemo(() => StyleSheet.create({
    root: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: TOP_BAR_HEIGHT + TOP_BAR_FADE_HEIGHT + 10,
      zIndex: 80,
    },
    fadeLayer: {
      position: 'absolute',
      left: 0,
      right: 0,
    },
    fadeCore: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 18,
      backgroundColor: th.background,
      opacity: th.scheme === 'light' ? 0.08 : 0.14,
    },
    fadeStrong: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 26,
      backgroundColor: th.background,
      opacity: th.scheme === 'light' ? 0.05 : 0.1,
    },
    fadeSoft: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 42,
      backgroundColor: th.background,
      opacity: th.scheme === 'light' ? 0.02 : 0.045,
    },
    row: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      height: TOP_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
    },
    sideSlot: {
      justifyContent: 'center',
      alignItems: 'flex-start',
      flexShrink: 0,
    },
    centerSlot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    titlePill: {
      minHeight: 40,
      maxWidth: '100%',
      paddingHorizontal: 20,
      borderRadius: 20,
      backgroundColor: th.scheme === 'light' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.scheme === 'light' ? 'rgba(17,24,39,0.12)' : 'rgba(255,255,255,0.14)',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: th.scheme === 'light' ? 0.06 : 0.2,
      shadowRadius: 8,
      overflow: 'hidden',
    },
    titleText: {
      ...typography.body,
      color: th.text,
      fontWeight: '700',
      fontSize: 18,
    },
    sideSpacer: {
      flexShrink: 0,
    },
    circleButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: th.scheme === 'light' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.scheme === 'light' ? 'rgba(17,24,39,0.12)' : 'rgba(255,255,255,0.14)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: th.scheme === 'light' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.scheme === 'light' ? 'rgba(17,24,39,0.12)' : 'rgba(255,255,255,0.14)',
      overflow: 'hidden',
    },
    buttonInnerGlass: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 22,
    },
    titleInnerGlass: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 20,
    },
    pressed: {
      opacity: 0.82,
    },
  }), [th.background, th.scheme, th.text]);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  function handleMiniMapToggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleMiniMap();
  }

  function renderRightControl() {
    if (rightAction === 'minimap') {
      const tintColor = miniMapOpen ? '#208AEF' : th.text;
      return (
        <Pressable
          onPress={handleMiniMapToggle}
          style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
        >
          <GlassView
            glassEffectStyle="regular"
            colorScheme={glassColorScheme}
            tintColor={glassTint}
            style={styles.buttonInnerGlass}
          />
          <SymbolView
            name={{ ios: 'list.bullet', android: 'format_list_bulleted', web: 'list' }}
            size={18}
            weight="semibold"
            tintColor={tintColor}
          />
        </Pressable>
      );
    }
    return <View style={[styles.sideSpacer, { width: sideWidth }]} />;
  }

  function renderLeftControl() {
    if (leftAction === 'menu') {
      return (
        <Pressable onPress={toggleSidebar} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}>
          <GlassView
            glassEffectStyle="regular"
            colorScheme={glassColorScheme}
            tintColor={glassTint}
            style={styles.buttonInnerGlass}
          />
          <SymbolView
            name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }}
            size={18}
            weight="semibold"
            tintColor={th.text}
          />
        </Pressable>
      );
    }
    if (leftAction === 'back') {
      return (
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <GlassView
            glassEffectStyle="regular"
            colorScheme={glassColorScheme}
            tintColor={glassTint}
            style={styles.buttonInnerGlass}
          />
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            weight="semibold"
            tintColor="#208AEF"
          />
        </Pressable>
      );
    }
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.root, anchorStyle]}>
      <View
        pointerEvents="none"
        style={[styles.fadeLayer, isReachable ? { bottom: 0 } : { top: 0 }]}
      >
        <View style={[styles.fadeCore, isReachable ? { bottom: TOP_BAR_HEIGHT - 2 } : { top: TOP_BAR_HEIGHT - 2 }]} />
        <View
          style={[
            styles.fadeStrong,
            isReachable ? { bottom: TOP_BAR_HEIGHT + 10 } : { top: TOP_BAR_HEIGHT + 10 },
          ]}
        />
        <View
          style={[
            styles.fadeSoft,
            isReachable ? { bottom: TOP_BAR_HEIGHT + 28 } : { top: TOP_BAR_HEIGHT + 28 },
          ]}
        />
      </View>

      <View style={[styles.row, isReachable ? { bottom: 0 } : { top: 0 }]}>
        <View style={[styles.sideSlot, { width: sideWidth }]}>
          {renderLeftControl()}
        </View>
        <View style={styles.centerSlot}>
          <View style={styles.titlePill}>
            <GlassView
              glassEffectStyle="regular"
              colorScheme={glassColorScheme}
              tintColor={glassTint}
              style={styles.titleInnerGlass}
            />
            <Text numberOfLines={1} style={styles.titleText}>{title}</Text>
          </View>
        </View>
        {renderRightControl()}
      </View>
    </View>
  );
}
