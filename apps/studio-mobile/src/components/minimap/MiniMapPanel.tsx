import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useTheme } from '@/hooks/use-theme';
import type { MiniMapTurnPair } from '@/types/minimap';
import {
  MINIMAP_RAIL_MAX_WIDTH,
  MINIMAP_RAIL_MIN_WIDTH,
  MINIMAP_RAIL_WIDTH_RATIO,
} from './constants';
import { MiniMapRail } from './MiniMapRail';

type Props = {
  turns: MiniMapTurnPair[];
  onTurnPress: (index: number) => void;
};

export function MiniMapPanel({ turns, onTurnPress }: Props) {
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();
  const { width: screenWidth } = useWindowDimensions();

  // Reset active pair when turns change (different chat or snapshot).
  const [activePairIndex, setActivePairIndex] = useState(0);
  useEffect(() => {
    setActivePairIndex(0);
  }, [turns]);

  const railWidth = Math.max(
    MINIMAP_RAIL_MIN_WIDTH,
    Math.min(MINIMAP_RAIL_MAX_WIDTH, Math.round(screenWidth * MINIMAP_RAIL_WIDTH_RATIO)),
  );
  const innerWidth = railWidth - 14;

  const boxBg = th.scheme === 'light'
    ? 'rgba(0,0,0,0.04)'
    : 'rgba(255,255,255,0.06)';
  const boxBorder = th.scheme === 'light'
    ? 'rgba(0,0,0,0.1)'
    : 'rgba(255,255,255,0.12)';

  // Single tap → scroll to answer (falls back to question if no answer yet).
  function handleSinglePress(pair: MiniMapTurnPair) {
    setActivePairIndex(pair.pairIndex);
    onTurnPress(pair.answerIndex ?? pair.questionIndex);
  }

  // Double tap → scroll to question.
  function handleDoublePress(pair: MiniMapTurnPair) {
    setActivePairIndex(pair.pairIndex);
    onTurnPress(pair.questionIndex);
  }

  // Footer/dial placeholder rendered inside the scroll flow, after the last turn box.
  const footerElement = (
    <View style={[styles.footerArea, { paddingBottom: contentBottomPadding + 2 }]}>
      <View
        style={[
          styles.footerBox,
          { width: innerWidth, borderColor: boxBorder, backgroundColor: boxBg },
        ]}
      />
    </View>
  );

  return (
    // No backgroundColor and no border — panel is visually transparent.
    // Only the boxes and counter create presence; no panel slab or divider line.
    <View style={[styles.panel, { width: railWidth }]}>

      {/* ── Top counter — paddingTop clears the floating AppTopBar ── */}
      <View style={[styles.counterArea, { paddingTop: contentTopPadding + 2 }]}>
        <View
          style={[
            styles.counterBox,
            { width: innerWidth, borderColor: boxBorder, backgroundColor: boxBg },
          ]}
        >
          <Text style={[styles.counterNumber, { color: th.text }]}>
            {turns.length > 0 ? `${activePairIndex + 1} / ${turns.length}` : '—'}
          </Text>
          <Text style={[styles.counterLabel, { color: th.textSecondary }]}>turns</Text>
        </View>
      </View>

      {/* ── Scrollable turns + footer in same flow ─────────────── */}
      <MiniMapRail
        turns={turns}
        onSinglePress={handleSinglePress}
        onDoublePress={handleDoublePress}
        railWidth={railWidth}
        footerContent={footerElement}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    // Fixed width only — no flex:1, no backgroundColor, no border.
    // Height fills via parent row's alignItems:'stretch' default.
  },
  counterArea: {
    alignItems: 'center',
    paddingBottom: 3,
  },
  counterBox: {
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 5,
    alignItems: 'center',
  },
  counterNumber: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  counterLabel: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    lineHeight: 11,
  },
  footerArea: {
    alignItems: 'center',
    paddingTop: 3,
  },
  footerBox: {
    height: 18,
    borderWidth: 1,
    borderRadius: 5,
  },
});
