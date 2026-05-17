import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CockpitMark } from './CockpitMark';
import {
  COCKPIT_BG,
  COCKPIT_INK,
  COCKPIT_INK_DIM,
} from './tokens';

// Brief warm-charcoal splash shown while identity restore runs at boot
// (refresh-token check + load_identity_state RPC). Replaces the previous
// "no splash, just default-themed empty library" cold-start moment.
export function CockpitSplash() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COCKPIT_BG }} edges={[]}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          paddingHorizontal: 32,
        }}>
        <CockpitMark size={64} />
        <Text
          style={{
            color: COCKPIT_INK,
            fontSize: 18,
            fontWeight: '500',
            letterSpacing: -0.3,
          }}>
          Cockpit Pro
        </Text>
        <ActivityIndicator color={COCKPIT_INK_DIM} />
      </View>
    </SafeAreaView>
  );
}
