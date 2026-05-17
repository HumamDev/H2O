type StoreShape = {
  open: boolean;
  listeners: Set<() => void>;
};

const g = global as Record<string, unknown>;
if (!g.__h2o_minimap) {
  g.__h2o_minimap = { open: false, listeners: new Set<() => void>() } as StoreShape;
}
const _store = g.__h2o_minimap as StoreShape;

function _notify(): void {
  _store.listeners.forEach(fn => fn());
}

export function subscribeMiniMap(listener: () => void): () => void {
  _store.listeners.add(listener);
  return () => _store.listeners.delete(listener);
}

export function getMiniMapOpen(): boolean {
  return _store.open;
}

export function toggleMiniMap(): void {
  _store.open = !_store.open;
  _notify();
}

export function closeMiniMap(): void {
  _store.open = false;
  _notify();
}
