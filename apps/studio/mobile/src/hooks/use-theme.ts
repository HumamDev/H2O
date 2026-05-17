import { useSyncExternalStore } from 'react';
import { Colors, type ColorScheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAppearanceMode, subscribeAppearance } from '@/state/appearance';

export function useTheme() {
  const systemScheme = useColorScheme();
  const appearanceMode = useSyncExternalStore(subscribeAppearance, getAppearanceMode);

  let scheme: ColorScheme;
  if (appearanceMode === 'cockpit') {
    scheme = 'cockpit';
  } else if (appearanceMode === 'system') {
    // System dark resolves to cockpit (the new premium dark);
    // system light resolves to neutral light.
    scheme = systemScheme === 'dark' ? 'cockpit' : 'light';
  } else {
    scheme = appearanceMode;
  }

  return { ...Colors[scheme], scheme };
}
