import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { MiniMapTurnPair } from '@/types/minimap';
import { MiniMapTurnItem } from './MiniMapTurnItem';

type Props = {
  turns: MiniMapTurnPair[];
  onSinglePress: (pair: MiniMapTurnPair) => void;
  onDoublePress: (pair: MiniMapTurnPair) => void;
  railWidth: number;
  /** Rendered after the last turn item, inside the scroll flow. */
  footerContent?: React.ReactNode;
};

export function MiniMapRail({ turns, onSinglePress, onDoublePress, railWidth, footerContent }: Props) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {turns.map(turn => (
        <MiniMapTurnItem
          key={turn.id}
          turn={turn}
          onSinglePress={onSinglePress}
          onDoublePress={onDoublePress}
          railWidth={railWidth}
        />
      ))}
      {footerContent}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    // No paddingVertical — spacing is managed by counterArea/footerArea paddings
    // and the turn item's implicit half-gap margins (MINIMAP_BOX_GAP / 2 each side).
  },
});
