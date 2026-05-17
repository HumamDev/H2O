import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { MiniMapTurnPair } from '@/types/minimap';
import { MINIMAP_BOX_GAP, MINIMAP_BOX_HEIGHT } from './constants';

type Props = {
  turn: MiniMapTurnPair;
  onSinglePress: (pair: MiniMapTurnPair) => void;
  onDoublePress: (pair: MiniMapTurnPair) => void;
  railWidth: number;
};

// Single-tap fires after this delay if no second tap arrives.
// This is the inherent tradeoff of double-tap detection on mobile:
// single-tap navigation is delayed by ~280ms to allow second-tap detection.
const DOUBLE_TAP_MS = 280;

export function MiniMapTurnItem({ turn, onSinglePress, onDoublePress, railWidth }: Props) {
  const th = useTheme();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending single-tap timer on unmount.
  useEffect(() => {
    return () => {
      if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    };
  }, []);

  const innerWidth = railWidth - 14;
  const boxBg = th.scheme === 'light'
    ? 'rgba(0,0,0,0.04)'
    : 'rgba(255,255,255,0.06)';
  const boxBorder = th.scheme === 'light'
    ? 'rgba(0,0,0,0.1)'
    : 'rgba(255,255,255,0.12)';

  function handlePress() {
    if (pressTimer.current !== null) {
      // Second tap within window — double tap → scroll to question.
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      onDoublePress(turn);
    } else {
      // First tap — wait to see if a second tap arrives.
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        // Single tap → scroll to answer (or question if no answer yet).
        onSinglePress(turn);
      }, DOUBLE_TAP_MS);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.touchTarget,
        { width: railWidth },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.box,
          { width: innerWidth, borderColor: boxBorder, backgroundColor: boxBg },
        ]}
      >
        <Text style={[styles.number, { color: th.textSecondary }]}>
          {turn.pairIndex + 1}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    // MINIMAP_BOX_HEIGHT + MINIMAP_BOX_GAP gives MINIMAP_BOX_GAP/2 top+bottom margin each,
    // matching the gap between counter/footer boxes.
    height: MINIMAP_BOX_HEIGHT + MINIMAP_BOX_GAP,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    height: MINIMAP_BOX_HEIGHT,
    borderWidth: 1,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  pressed: {
    opacity: 0.5,
  },
});
