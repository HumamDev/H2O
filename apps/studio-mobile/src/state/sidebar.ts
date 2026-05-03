type StoreShape = {
  open: boolean;
  listeners: Set<() => void>;
};

const g = global as Record<string, unknown>;
if (!g.__h2o_sidebar) {
  g.__h2o_sidebar = { open: false, listeners: new Set<() => void>() } as StoreShape;
}
const _store = g.__h2o_sidebar as StoreShape;

function _notify(): void {
  _store.listeners.forEach(fn => fn());
}

export function subscribeSidebar(listener: () => void): () => void {
  _store.listeners.add(listener);
  return () => _store.listeners.delete(listener);
}

export function getSidebarOpen(): boolean {
  return _store.open;
}

export function openSidebar(): void {
  _store.open = true;
  _notify();
}

export function closeSidebar(): void {
  _store.open = false;
  _notify();
}

export function toggleSidebar(): void {
  _store.open = !_store.open;
  _notify();
}
