import { useSyncExternalStore } from 'react';
import { Colors, type ColorScheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAppearanceMode, subscribeAppearance } from '@/state/appearance';

export function useTheme() {
  const systemScheme = useColorScheme();
  const appearanceMode = useSyncExternalStore(subscribeAppearance, getAppearanceMode);

  let scheme: ColorScheme;
  if (appearanceMode === 'atmospheric') {
    scheme = 'atmospheric';
  } else if (appearanceMode === 'system') {
    scheme = (systemScheme ?? 'light') as 'light' | 'dark';
  } else {
    scheme = appearanceMode;
  }

  return { ...Colors[scheme], scheme };
}
