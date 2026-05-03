import { useSyncExternalStore } from 'react';

import { getMiniMapOpen, subscribeMiniMap } from '@/state/minimap';

export function useMiniMap(): { readonly open: boolean } {
  const open = useSyncExternalStore(subscribeMiniMap, getMiniMapOpen);
  return { open };
}
