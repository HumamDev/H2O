import { SymbolView } from 'expo-symbols';
import React from 'react';
import { View } from 'react-native';

import { COCKPIT_BG_RAISED, COCKPIT_COBALT, COCKPIT_CYAN } from './tokens';

// Brand mark — composes a SymbolView (scope/crosshair) inside a tinted
// circular medallion. Avoids a react-native-svg dependency by using the
// expo-symbols glyph already used elsewhere in the app.
export function CockpitMark({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: COCKPIT_BG_RAISED,
        borderWidth: 1,
        borderColor: 'rgba(138,170,214,0.32)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COCKPIT_COBALT,
        shadowOpacity: 0.28,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 0 },
      }}>
      <SymbolView
        name={{ ios: 'scope', android: 'gps_fixed', web: 'gps_fixed' }}
        size={Math.round(size * 0.5)}
        weight="regular"
        tintColor={COCKPIT_CYAN}
      />
    </View>
  );
}
